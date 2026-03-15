# Cognitive Tasks Demo

Simple classroom web app for two behavioral tasks:

- Stroop
- Visual Search

## Features

- Mobile-friendly static site
- Google Sheets auto-submission via Apps Script
- Student ID based submissions with automatic attempt numbering
- Separate results page for instructor use

## Files

- [index.html](/Users/bdil_harim/Documents/GitHub/HY_2026_spring/index.html): student task page
- [results.html](/Users/bdil_harim/Documents/GitHub/HY_2026_spring/results.html): results dashboard
- [config.js](/Users/bdil_harim/Documents/GitHub/HY_2026_spring/config.js): Apps Script URL
- [apps-script/Code.gs](/Users/bdil_harim/Documents/GitHub/HY_2026_spring/apps-script/Code.gs): Google Apps Script backend

## Setup

1. Deploy [apps-script/Code.gs](/Users/bdil_harim/Documents/GitHub/HY_2026_spring/apps-script/Code.gs) as a Google Apps Script web app.
2. Put the web app URL into [config.js](/Users/bdil_harim/Documents/GitHub/HY_2026_spring/config.js).
3. Deploy this repo with GitHub Pages.

```js
export const APPS_SCRIPT_URL = "YOUR_APPS_SCRIPT_WEB_APP_URL";
```

## Pages

- Student page: `/`
- Results page: `/results.html`
