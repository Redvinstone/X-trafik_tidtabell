require("dotenv").config();

const express = require("express");
const fetch = require("node-fetch");
const protobuf = require("protobufjs");
const fs = require("fs");
const parse = require("csv-parse/sync").parse;

const app = express();
const PORT = process.env.PORT || 3000;

// === Config ===
const API_KEY = process.env.API_KEY;
const STOP_ID = process.env.STOP_ID; 
const GTFS_PROTO = "./gtfs-realtime.proto";
const GTFS_URL = `https://opendata.samtrafiken.se/gtfs-rt/xt/TripUpdates.pb?key=${API_KEY}`;

// Static GTFS mapping
const ROUTES_MAP = parse(fs.readFileSync("./gtfs/routes.txt"), { columns: true })
  .reduce((map, r) => {
    map[r.route_id] = r.route_short_name || r.route_long_name;
    return map;
  }, {});
const TRIPS_MAP = parse(fs.readFileSync("./gtfs/trips.txt"), { columns: true })
  .reduce((map, t) => {
    map[t.trip_id] = t.route_id;
    return map;
  }, {});

// === API Route ===
let cachedDepartures = null;
let lastFetchTime = 0;
const CACHE_DURATION = 30 * 1000; // 30 seconds

app.get("/api/departures", async (req, res) => {
  const now = Date.now();

  if (cachedDepartures && now - lastFetchTime < CACHE_DURATION) {
    return res.json(cachedDepartures);
  }

  try {
    const root = await protobuf.load(GTFS_PROTO);
    const FeedMessage = root.lookupType("transit_realtime.FeedMessage");

    const response = await fetch(GTFS_URL);
    const buffer = await response.arrayBuffer();
    const message = FeedMessage.decode(new Uint8Array(buffer));

    const departures = [];

    message.entity.forEach(entity => {
      const update = entity.tripUpdate;
      if (!update?.stopTimeUpdate) return;

      update.stopTimeUpdate.forEach(u => {
        if (u.stopId === STOP_ID) {
          const depTime = u.departure?.time || u.arrival?.time;
          if (depTime) {
            const routeId = TRIPS_MAP[update.trip?.tripId];
            const routeName = ROUTES_MAP[routeId] || "?";

            departures.push({
              route: routeName,
              time: new Date(depTime * 1000).toLocaleTimeString("sv-SE", {
                hour: "2-digit", minute: "2-digit"
              })
            });
          }
        }
      });
    });

    departures.sort((a, b) => a.time.localeCompare(b.time));

    cachedDepartures = departures; // store result
    lastFetchTime = now;

    res.json(departures);
  } catch (err) {
    console.error("Error loading departures:", err);
    res.status(500).json({ error: "Failed to fetch departures" });
  }
});

// === Serve static files ===
app.use(express.static("public"));

app.listen(PORT, () => console.log(`🟢 Server running at http://localhost:${PORT}`));
