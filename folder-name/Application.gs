// ─── Constants ───────────────────────────────────────────────────────────────
const SHEET = {
  PROFILES:     'Profiles',
  APPOINTMENTS: 'Appointments'
};

// ─── Web App Entry Point ──────────────────────────────────────────────────────
function doGet() {
  return HtmlService.createHtmlOutputFromFile('WebApp')
    .setSandboxMode(HtmlService.SandboxMode.IFRAME);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getSheet(name) {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
}

function getSheetData(name) {
  return getSheet(name).getDataRange().getValues();
}

// ─── Auth ─────────────────────────────────────────────────────────────────────
function login(username, password) {
  const data = getSheetData(SHEET.PROFILES);

  for (let i = 1; i < data.length; i++) {
    if (data[i][2] === username && data[i][3] === password) {
      return { success: true, name: data[i][0] };
    }
  }
  return { success: false };
}

function signUp(name, email, username, password) {
  const sheet = getSheet(SHEET.PROFILES);
  const data  = sheet.getDataRange().getValues();

  // Check for duplicate username (column index 2)
  for (let i = 1; i < data.length; i++) {
    if (data[i][2] === username) return false;
  }

  sheet.appendRow([name, email, username, password]);
  return true;
}

// ─── Appointments ─────────────────────────────────────────────────────────────
function getUserAppointments(username) {
  const data = getSheetData(SHEET.APPOINTMENTS);

  const appointments = [];
  for (let i = 1; i < data.length; i++) {
    if (data[i][6] !== username) continue;

    appointments.push({
      key:      data[i][0],
      hospital: data[i][1],
      doctor:   data[i][2],
      date:     new Date(data[i][3]),
      time:     Utilities.formatDate(data[i][4], "GMT", "hh:mm a"),
      reason:   data[i][5],
      user:     data[i][6]
    });
  }

  Logger.log("User Appointments: " + JSON.stringify(appointments));
  return JSON.stringify(appointments);
}

function updateAppointmentList(appointments) {
  const sheet       = getSheet(SHEET.APPOINTMENTS);
  const currentData = sheet.getDataRange().getValues();

  // Build a map of existing appointments keyed by their unique key
  const existingMap = new Map();
  for (let i = 1; i < currentData.length; i++) {
    existingMap.set(currentData[i][0], i + 1); // Store 1-based row number
  }

  // Update or insert incoming appointments
  for (const appt of appointments) {
    const row = [appt.key, appt.hospital, appt.doctor, appt.date, appt.time, appt.reason, appt.user];

    if (existingMap.has(appt.key)) {
      // Overwrite the existing row
      sheet.getRange(existingMap.get(appt.key), 1, 1, row.length).setValues([row]);
      existingMap.delete(appt.key); // Mark as handled
    } else {
      sheet.appendRow(row);
    }
  }

  // Delete any appointments that were not in the incoming list
  // Iterate in reverse so row deletions don't shift indices
  const rowsToDelete = [...existingMap.values()].sort((a, b) => b - a);
  for (const rowNum of rowsToDelete) {
    sheet.deleteRow(rowNum);
  }

  return getUserAppointments(); // Return the refreshed list
}

function deleteAppointment(key) {
  const sheet       = getSheet(SHEET.APPOINTMENTS);
  const currentData = sheet.getDataRange().getValues();

  for (let i = 1; i < currentData.length; i++) {
    if (currentData[i][0] === key) {
      sheet.deleteRow(i + 1);
      return true;
    }
  }
  return false; // Key not found
}

// ─── Hospital Lookup ──────────────────────────────────────────────────────────
function findNearbyHospitals(address) {
  const apiKey    = getKey();
  const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}`;
  const geocode   = JSON.parse(UrlFetchApp.fetch(geocodeUrl).getContentText());

  if (geocode.status !== "OK") return [];

  const { lat, lng } = geocode.results[0].geometry.location;
  const placesUrl    = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=10000&type=hospital&key=${apiKey}`;
  const places       = JSON.parse(UrlFetchApp.fetch(placesUrl).getContentText());

  return places.results.map(p => ({ name: p.name, address: p.vicinity }));
}
