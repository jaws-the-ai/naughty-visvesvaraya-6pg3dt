import React, { useState, useEffect, useRef } from "react";

import { auth, provider } from "./firebase";
import { signInWithPopup, onAuthStateChanged } from "firebase/auth";

import { db } from "./firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";

function MyShows() {
  const [shows, setShows] = useState(() => {
    const stored = localStorage.getItem("trackedShows");
    return stored ? JSON.parse(stored) : [];
  });

  const [theme, setTheme] = useState(() => {
    return localStorage.getItem("theme") || "dark";
  });

  const [user, setUser] = useState(null);

  // When auth state changes (login/logout)
  useEffect(() => {
    onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        setUser(currentUser);

        const userDoc = doc(db, "users", currentUser.uid);
        getDoc(userDoc).then((docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data();
            if (data.shows) {
              setShows(data.shows);
            }
          }
        });
      } else {
        setUser(null);
      }
    });
  }, []);

  // Sync shows to Firestore when they change
  useEffect(() => {
    if (user) {
      const userDoc = doc(db, "users", user.uid);
      setDoc(userDoc, { shows }, { merge: true })
        .then(() => {
          console.log("✅ Synced shows to Firestore");
        })
        .catch((err) => {
          console.error("❌ Firestore sync error:", err);
        });
    }
  }, [shows, user]);
  const [newShow, setNewShow] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [notification, setNotification] = useState(null);
  const [filter, setFilter] = useState("all");
  const [sortMode, setSortMode] = useState("upcoming");
  const trackedRef = useRef(null);
  const [sortOption, setSortOption] = useState("alphabetical");

  const isDark = theme === "dark";
  const colors = {
    bg: isDark ? "#121212" : "#f4f4f4",
    card: isDark ? "#1f1f1f" : "#ffffff",
    text: isDark ? "#ffffff" : "#1a1a1a",
    subText: isDark ? "#ccc" : "#555",
    border: isDark ? "#333" : "#ddd",
    highlight: "#e50914",
  };

  useEffect(() => {
    if ("Notification" in window && Notification.permission !== "granted") {
      Notification.requestPermission();
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("trackedShows", JSON.stringify(shows));
  }, [shows]);

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);

    shows.forEach(async (show) => {
      if (!show.id) return;

      try {
        const res = await fetch(
          `https://api.tvmaze.com/shows/${show.id}/episodes`
        );
        const eps = await res.json();
        const todayEp = eps.find((ep) => ep.airdate === today);

        if (todayEp) {
          const msg = `📺 New episode of "${show.title}" airs today: "${todayEp.name}"`;
          setNotification(msg);

          if (
            "Notification" in window &&
            Notification.permission === "granted"
          ) {
            new Notification("New Episode Alert!", {
              body: msg,
              icon: show.image || "",
            });
          }
        }
      } catch (err) {
        console.error("Episode notification error:", err);
      }
    });
  }, [shows]);

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    shows.forEach(async (show) => {
      try {
        const res = await fetch(
          `https://api.tvmaze.com/shows/${show.id}/seasons`
        );
        const seasons = await res.json();
        const upcoming = seasons.find((s) => s.premiereDate > today);
        if (upcoming) {
          setNotification(
            `📢 New season of "${show.title}" premieres on ${upcoming.premiereDate}!`
          );
        }
      } catch (err) {
        console.error("Season check error:", err);
      }
    });
  }, []);
  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("theme", next);
  };
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user) {
        console.log("Logged in as:", user.displayName);
        // 🔒 Sync to Firestore here in the future
      }
    });

    return () => unsubscribe();
  }, []);

  const handleAddShow = (
    id,
    title,
    image,
    rating,
    genres,
    summary,
    site,
    status,
    premiered,
    seasons,
    nextEpisode
  ) => {
    if (shows.some((s) => s.title === title)) return;
    setShows((prev) => [
      ...prev,
      {
        id,
        title,
        image,
        rating,
        genres,
        summary,
        site,
        status,
        premiered,
        seasons,
        nextEpisode,
        watched: false,
        notes: "",
      },
    ]);
    setNewShow("");
    setSearchResults([]);
    setTimeout(() => {
      trackedRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 100);
  };

  const fetchAndAddShow = async (selectedShow) => {
    try {
      const res = await fetch(
        `https://api.tvmaze.com/singlesearch/shows?q=${encodeURIComponent(
          selectedShow.title
        )}`
      );
      const showData = await res.json();

      const seasonsRes = await fetch(
        `https://api.tvmaze.com/shows/${showData.id}/seasons`
      );
      const seasonsData = await seasonsRes.json();

      const episodesRes = await fetch(
        `https://api.tvmaze.com/shows/${showData.id}/episodes`
      );
      const episodes = await episodesRes.json();

      const futureEps = episodes.filter(
        (ep) => new Date(ep.airdate) > new Date()
      );
      const nextEp = futureEps.length > 0 ? futureEps[0] : null;

      const status = showData.status || "Unknown";
      const premiered = showData.premiered
        ? new Date(showData.premiered).getFullYear()
        : "N/A";
      const seasonCount = seasonsData.length;

      handleAddShow(
        showData.id,
        selectedShow.title,
        selectedShow.image,
        selectedShow.rating,
        selectedShow.genres,
        selectedShow.summary,
        selectedShow.site,
        status,
        premiered,
        seasonCount,
        nextEp
      );
    } catch (error) {
      console.error("Fetch error:", error);
    }
  };

  const handleSearchChange = async (query) => {
    setNewShow(query);
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }

    try {
      const res = await fetch(`https://api.tvmaze.com/search/shows?q=${query}`);
      const data = await res.json();
      const formatted = data.map((item) => ({
        title: item.show.name,
        image: item.show.image?.medium || null,
        rating: item.show.rating?.average || "N/A",
        genres: item.show.genres || [],
        summary: item.show.summary || "",
        site: item.show.officialSite || null,
      }));
      setSearchResults(formatted);
    } catch (err) {
      console.error("Search error:", err);
      setSearchResults([]);
    }
  };
  const countdownTo = (airdate) => {
    const now = new Date();
    const date = new Date(airdate);
    const diff = Math.ceil((date - now) / (1000 * 60 * 60 * 24));
    return diff > 0 ? `${diff} day${diff > 1 ? "s" : ""}` : "Today";
  };

  const toggleWatched = (index) => {
    const updated = [...shows];
    updated[index].watched = !updated[index].watched;
    setShows(updated);
  };

  const handleDelete = (index) => {
    const updated = [...shows];
    updated.splice(index, 1);
    setShows(updated);
  };

  const updateNote = (index, note) => {
    const updated = [...shows];
    updated[index].notes = note;
    setShows(updated);
  };
  const sortShows = (shows) => {
    switch (sortOption) {
      case "alphabetical":
        return [...shows].sort((a, b) => a.title.localeCompare(b.title));
      case "rating":
        return [...shows].sort((a, b) => b.rating - a.rating);
      case "nextEpisode":
        return [...shows].sort((a, b) => {
          const aDate = a.nextEpisode
            ? new Date(a.nextEpisode.airdate)
            : Infinity;
          const bDate = b.nextEpisode
            ? new Date(b.nextEpisode.airdate)
            : Infinity;
          return aDate - bDate;
        });
      default:
        return shows;
    }
  };
  const filteredShows = sortShows(
    filter === "all"
      ? shows
      : shows.filter((s) => (filter === "watched" ? s.watched : !s.watched))
  );

  const upcomingEpisodes = shows
    .filter((s) => s.nextEpisode)
    .sort(
      (a, b) =>
        new Date(a.nextEpisode.airdate) - new Date(b.nextEpisode.airdate)
    );

  const groupedByGenre = shows.reduce((groups, show) => {
    const key = show.genres?.[0] || "Other";
    if (!groups[key]) groups[key] = [];
    groups[key].push(show);
    return groups;
  }, {});

  const groupedByStatus = shows.reduce((groups, show) => {
    const key = show.status || "Unknown";
    if (!groups[key]) groups[key] = [];
    groups[key].push(show);
    return groups;
  }, {});

  const renderShowCard = (show, index) => (
    <div
      key={index}
      style={{
        background: colors.card,
        border: `1px solid ${colors.border}`,
        borderRadius: "8px",
        padding: "12px",
        marginBottom: "16px",
        display: "flex",
        gap: "12px",
      }}
    >
      {show.image && (
        <img
          src={show.image}
          alt={show.title}
          style={{
            width: "90px",
            height: "auto",
            objectFit: "cover",
            borderRadius: "6px",
          }}
        />
      )}
      <div style={{ flexGrow: 1 }}>
        <label>
          <input
            type="checkbox"
            checked={show.watched}
            onChange={() => toggleWatched(index)}
          />{" "}
          <strong
            style={{
              textDecoration: show.watched ? "line-through" : "none",
              fontSize: "1.1rem",
            }}
          >
            {show.title}
          </strong>
        </label>
        <div
          style={{
            fontSize: "0.85rem",
            color: colors.subText,
            marginTop: "4px",
          }}
        >
          ⭐ {show.rating} <br />
          🎭 {show.genres?.join(", ") || "N/A"} <br />
          📅 {show.premiered} | {show.seasons} season
          {show.seasons === 1 ? "" : "s"} <br />
          🔴 {show.status}
          {show.nextEpisode && (
            <>
              <br />⏭ {show.nextEpisode.name} ({show.nextEpisode.airdate})
              <br />⌛ {countdownTo(show.nextEpisode.airdate)}
            </>
          )}
        </div>

        <textarea
          value={show.notes}
          onChange={(e) => updateNote(index, e.target.value)}
          placeholder="Add notes..."
          rows={2}
          style={{
            marginTop: "8px",
            width: "100%",
            background: isDark ? "#121212" : "#eee",
            border: `1px solid ${colors.border}`,
            borderRadius: "4px",
            padding: "6px",
            color: colors.text,
            fontSize: "0.9rem",
          }}
        />

        {show.site && (
          <a
            href={show.site}
            target="_blank"
            rel="noreferrer"
            style={{
              fontSize: "0.8rem",
              color: colors.highlight,
              display: "inline-block",
              marginTop: "6px",
            }}
          >
            🌐 Official Site
          </a>
        )}
      </div>
      <button
        onClick={() => handleDelete(index)}
        style={{
          background: colors.highlight,
          color: "white",
          border: "none",
          padding: "6px 10px",
          borderRadius: "4px",
          cursor: "pointer",
          alignSelf: "flex-start",
        }}
      >
        ✕
      </button>
    </div>
  );
  return (
    <div
      style={{
        fontFamily: "'Segoe UI', sans-serif",
        padding: "2rem",
        maxWidth: "900px",
        margin: "0 auto",
        backgroundColor: colors.bg,
        color: colors.text,
        minHeight: "100vh",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: "1rem",
        }}
      >
        <h1 style={{ fontSize: "2rem", color: "white" }}>🎬 My Show Tracker</h1>
        <button
          onClick={toggleTheme}
          style={{
            backgroundColor: colors.card,
            color: colors.text,
            border: `1px solid ${colors.border}`,
            padding: "6px 12px",
            borderRadius: "4px",
            cursor: "pointer",
          }}
        >
          {theme === "dark" ? "🌞 Light" : "🌙 Dark"}
        </button>
      </div>
      {!user ? (
        <button
          onClick={() => signInWithPopup(auth, provider)}
          style={{
            backgroundColor: colors.highlight,
            color: "white",
            padding: "10px 16px",
            border: "none",
            borderRadius: "6px",
            cursor: "pointer",
            marginBottom: "1rem",
          }}
        >
          🔐 Sign In with Google
        </button>
      ) : (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "1rem",
            color: colors.subText,
          }}
        >
          <span>👋 Welcome, {user.displayName}</span>
          <button
            onClick={() => auth.signOut()}
            style={{
              padding: "6px 12px",
              backgroundColor: "#e50914",
              color: "white",
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
              marginLeft: "1rem",
            }}
          >
            🚪 Sign Out
          </button>
        </div>
      )}

      {notification && (
        <div
          style={{
            backgroundColor: colors.card,
            borderLeft: `4px solid ${colors.highlight}`,
            padding: "10px 14px",
            borderRadius: "6px",
            marginBottom: "1rem",
            fontSize: "0.95rem",
          }}
        >
          {notification}
        </div>
      )}

      <input
        type="text"
        value={newShow}
        onChange={(e) => handleSearchChange(e.target.value)}
        placeholder="🔍 Search for a show"
        style={{
          width: "100%",
          padding: "12px",
          borderRadius: "6px",
          border: `1px solid ${colors.border}`,
          fontSize: "1rem",
          background: colors.card,
          color: colors.text,
          marginBottom: "12px",
        }}
      />

      {searchResults.length > 0 && (
        <ul style={{ listStyle: "none", paddingLeft: 0, marginBottom: "20px" }}>
          {searchResults.map((show, index) => (
            <li
              key={index}
              style={{
                display: "flex",
                alignItems: "center",
                padding: "8px",
                border: `1px solid ${colors.border}`,
                borderRadius: "6px",
                marginBottom: "8px",
                cursor: "pointer",
                background: colors.card,
              }}
              onClick={() => fetchAndAddShow(show)}
            >
              {show.image && (
                <img
                  src={show.image}
                  alt={show.title}
                  style={{
                    marginRight: "12px",
                    width: "50px",
                    height: "auto",
                    objectFit: "cover",
                    borderRadius: "4px",
                  }}
                />
              )}
              <div>
                <strong style={{ color: colors.text }}>{show.title}</strong>
                <div style={{ fontSize: "0.85rem", color: colors.subText }}>
                  ⭐ {show.rating} • {show.genres.join(", ")}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div style={{ marginBottom: "1.5rem" }}>
        {["all", "watched", "unwatched"].map((type) => (
          <button
            key={type}
            onClick={() => setFilter(type)}
            style={{
              marginRight: "8px",
              padding: "8px 14px",
              backgroundColor: filter === type ? colors.highlight : colors.card,
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
            }}
          >
            {type.charAt(0).toUpperCase() + type.slice(1)}
          </button>
        ))}
      </div>
      <div style={{ marginBottom: "1.5rem" }}>
        <label style={{ marginRight: "8px", color: colors.subText }}>
          Sort by:
        </label>
        <select
          value={sortOption}
          onChange={(e) => setSortOption(e.target.value)}
          style={{
            padding: "8px 12px",
            borderRadius: "4px",
            border: `1px solid ${colors.border}`,
            background: colors.card,
            color: colors.text,
          }}
        >
          <option value="alphabetical">Alphabetical</option>
          <option value="rating">Rating</option>
          <option value="nextEpisode">Next Episode</option>
        </select>
      </div>

      <h2 ref={trackedRef} style={{ marginBottom: "1rem" }}>
        📂 Tracked Shows
      </h2>

      {filteredShows.length === 0 ? (
        <p style={{ color: colors.subText }}>No shows found.</p>
      ) : (
        filteredShows.map((show) => {
          const realIndex = shows.findIndex((s) => s.id === show.id);
          return renderShowCard(show, realIndex);
        })
      )}

      <h2 style={{ marginTop: "3rem", marginBottom: "1rem" }}>
        📅 Upcoming Episodes
      </h2>
      {upcomingEpisodes.length === 0 ? (
        <p style={{ color: colors.subText }}>No upcoming episodes found.</p>
      ) : (
        <ul style={{ paddingLeft: 0, listStyle: "none" }}>
          {upcomingEpisodes.map((show, idx) => (
            <li
              key={idx}
              style={{
                background: colors.card,
                padding: "10px 14px",
                borderRadius: "6px",
                marginBottom: "10px",
                border: `1px solid ${colors.border}`,
              }}
            >
              <strong style={{ color: colors.text }}>{show.title}</strong>
              <div style={{ color: colors.subText, fontSize: "0.9rem" }}>
                {show.nextEpisode.name} —{" "}
                <span style={{ color: colors.text }}>
                  {show.nextEpisode.airdate}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default MyShows;
