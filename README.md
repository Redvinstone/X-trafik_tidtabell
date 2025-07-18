﻿# X-trafik_tidtabell

## Overview

This project is a real-time departure board for public transport using the X-trafik GTFS Realtime API. It fetches live departure data for a specified stop and displays it on a web interface.

---

## 1. Setup

1. Clone the repository and navigate to the project folder.

2. Install dependencies:

```bash
npm install
```

3. Create a `.env` file in the project root with the following content:

```code
API_KEY=YOUR_API_KEY_HERE
```

- Replace `YOUR_API_KEY_HERE` with your actual API key from Trafiklab.

> There is an **example.env** file in the project with all editable parameters.

---

## 2. Run the server

Start the backend server with:

```bash
node server.js
```

The web app will be available at http://localhost:3000.

---

## 3. Configuration

- Set the STOP_ID in `.env` to display departures for a specific stop.
  
- Set the STOP_NAME in `.env` to display departures for all stops on a station.

- The app automatically refreshes every 30 seconds to update departures in real time.
