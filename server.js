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
let STOP_IDS
const STOP_NAME = process.env.STOP_NAME || null;
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

// Get stop display name
const stopsCsv = fs.readFileSync("./gtfs/stops.txt", "utf-8");
const stops = parse(stopsCsv, { columns: true });

function getStopDisplayName(stopId) {
  const stop = stops.find(s => s.stop_id === stopId);
  if (!stop) return `Unknown stop (${stopId})`;

  const name = stop.stop_name || "Unnamed stop";
  const platform = stop.platform_code || "?";
  return `${name} läge ${platform}`;
}

// Get stop id from name
function getStopIdsFromName(name) {
  if (name) {
    MATCHING_STOP_IDS = stops
      .filter(stop => stop.stop_name.toLowerCase().includes(STOP_NAME.toLowerCase()))
      .map(stop => stop.stop_id);
    
    console.log(`Matched stops for "${name}":`, MATCHING_STOP_IDS);
  }
  if (!MATCHING_STOP_IDS) return null;
  return MATCHING_STOP_IDS;
}

if (STOP_ID) {
  stopDisplayName = getStopDisplayName(STOP_ID);
} else if (STOP_NAME) {
  const matchingStopIds = getStopIdsFromName(STOP_NAME);
  if (matchingStopIds.length === 1) {
    STOP_IDS = matchingStopIds;
    console.log(`Single stop matched for "${STOP_NAME}":`, matchingStopIds[0]);
    stopDisplayName = getStopDisplayName(STOP_ID);
  } else if (matchingStopIds.length > 1) {
    STOP_IDS = matchingStopIds;
    console.log(`Multiple stops matched for "${STOP_NAME}":`, matchingStopIds);
    stopDisplayName = STOP_NAME;
  } else {
    console.error(`No stops found for "${STOP_NAME}"`);
    stopDisplayName = `No stops found for "${STOP_NAME}"`;
  }
} else {
  console.error("No STOP_ID or STOP_NAME defined in environment variables");
  stopDisplayName = "No stop defined";
}

// === API Route ===
let cachedDepartures = null;
let lastFetchTime = 0;
const CACHE_DURATION = 30 * 1000; // 30 seconds

app.get("/api/departures", async (req, res) => {
  const now = Date.now();

  if (cachedDepartures && now - lastFetchTime < CACHE_DURATION) {
    return res.json({stopDisplayName: stopDisplayName, departures: cachedDepartures});
  }

  if (!STOP_ID && !STOP_IDS) {
    return res.status(500).json({ error: "No STOP_ID defined" });
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
        if (STOP_ID && u.stopId === STOP_ID || STOP_IDS?.includes(u.stopId)) {
          const depTime = u.departure?.time || u.arrival?.time;
          if (depTime) {
            const routeId = TRIPS_MAP[update.trip?.tripId];
            const routeName = ROUTES_MAP[routeId] || "?";

            departures.push({
              route: routeName,
              time: new Date(depTime * 1000).toLocaleTimeString("sv-SE", {
                hour: "2-digit", minute: "2-digit"
              }),
              platform: stops.find(s => s.stop_id === u.stopId)?.platform_code || "?"
            });
          }
        }
      });
    });

    departures.sort((a, b) => a.time.localeCompare(b.time));

    cachedDepartures = departures; // store result
    lastFetchTime = now;

    res.json({stopDisplayName: stopDisplayName, departures: departures});
  } catch (err) {
    console.error("Error loading departures:", err);
    res.status(500).json({ error: "Failed to fetch departures" });
  }
});

// === Serve static files ===
app.use(express.static("public"));

app.listen(PORT, () => console.log(`🟢 Server running at http://localhost:${PORT}`));
