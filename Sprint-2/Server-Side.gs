// ─── Constants ────────────────────────────────────────────────────────────────
const SHEET = {
  USERS:         'Users',
  APPOINTMENTS:  'Appointments',
  DOCTORS:       'Doctors',
  PRESCRIPTIONS: 'Prescriptions',
  PATIENTS:      'Patients'
};
const MAX_LOGIN_ATTEMPTS = 3;

// ─── Web App Entry Point ──────────────────────────────────────────────────────
function doGet() {
  return HtmlService.createHtmlOutputFromFile('Client-Side')
    .setTitle('VCU Student Healthcare Application')
    .setFaviconUrl('https://upload.wikimedia.org/wikipedia/en/thumb/1/18/VCU_Athletics_Logo.svg/800px-VCU_Athletics_Logo.svg.png')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getSheet(name) {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
}

function getSheetData(name) {
  return getSheet(name).getDataRange().getValues();
}

function getUserEmail(username) {
  const data = getSheetData(SHEET.USERS);
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === username) return data[i][3];
  }
  return null;
}

function sendEmail(to, subject, body) {
  if (to) MailApp.sendEmail(to, subject, body);
}

function signEmail(body) {
  return body + '\n\nBest regards,\nVCU Student Healthcare Team';
}

// ─── Auth ─────────────────────────────────────────────────────────────────────
function validateLogin(username, password) {
  const data = getSheetData(SHEET.USERS);
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === username && data[i][1] === password) {
      return { username: data[i][0], fullName: data[i][2], email: data[i][3], role: data[i][4] || 'USER' };
    }
  }
  return null;
}

function registerUser(username, password, fullName, email) {
  if (username.length < 5)                        throw new Error('Username must be at least 5 characters');
  if (password.length < 8 ||
      !/[A-Za-z]/.test(password) ||
      !/[0-9]/.test(password) ||
      !/[^A-Za-z0-9]/.test(password))             throw new Error('Password must meet complexity requirements');

  const sheet = getSheet(SHEET.USERS);
  const data  = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === username) throw new Error('Username already exists');
  }

  sheet.appendRow([username, password, fullName, email, null, new Date()]);
  sendEmail(email, 'Welcome to VCU Student Healthcare', signEmail(
    `Dear ${fullName},\n\nYour account has been successfully created. You can now log in to schedule appointments, manage prescriptions, and access patient information.`
  ));
}

function validateProviderPassword(username, password) {
  const cache      = CacheService.getUserCache();
  const key        = `login_attempts_${username}`;
  const attempts   = parseInt(cache.get(key) || '0');

  if (attempts >= MAX_LOGIN_ATTEMPTS) throw new Error('Account locked due to too many failed attempts');

  const data = getSheetData(SHEET.USERS);
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === username && data[i][1] === password) {
      cache.remove(key);
      return true;
    }
  }

  cache.put(key, String(attempts + 1), 3600);
  return false;
}

// ─── Appointments ─────────────────────────────────────────────────────────────
function getAppointments(username) {
  const data = getSheetData(SHEET.APPOINTMENTS);
  const out  = [];
  for (let i = 1; i < data.length; i++) {
    if (data[i][1] == username) {
      out.push({ id: data[i][0], username: data[i][1], date: data[i][2],
                 time: data[i][3], location: data[i][4], doctor: data[i][5], reason: data[i][6] });
    }
  }
  return JSON.stringify(out);
}

function createAppointment(appt) {
  if (new Date(`${appt.date} ${appt.time}`) < new Date()) throw new Error('Cannot schedule appointments in the past');

  const id = Utilities.getUuid();
  getSheet(SHEET.APPOINTMENTS).appendRow([id, appt.username, appt.date, appt.time, appt.location, appt.doctor, appt.reason, new Date()]);
  sendEmail(getUserEmail(appt.username), 'Appointment Confirmation', signEmail(
    `Dear Patient,\n\nYour appointment has been scheduled:\n\nDate: ${appt.date} at ${appt.time}\nDoctor: Dr. ${appt.doctor}\nLocation: ${appt.location}\nReason: ${appt.reason}\n\nPlease arrive 15 minutes early.`
  ));
  return id;
}

function editAppointment(appointmentId, updated) {
  const sheet = getSheet(SHEET.APPOINTMENTS);
  const data  = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] !== appointmentId) continue;
    if (new Date(data[i][2] + ' ' + data[i][3]) - new Date() < 24 * 60 * 60 * 1000)
      throw new Error('Cannot modify appointments within 24 hours');

    sheet.getRange(i + 1, 3).setValue(updated.date);
    sheet.getRange(i + 1, 4).setValue(updated.time);
    sheet.getRange(i + 1, 7).setValue(updated.reason);

    sendEmail(getUserEmail(data[i][1]), 'Appointment Updated', signEmail(
      `Dear Patient,\n\nYour appointment has been updated to ${updated.date} at ${updated.time} with Dr. ${data[i][5]} at ${data[i][4]}.\nReason: ${updated.reason}`
    ));
    return true;
  }
  throw new Error('Appointment not found');
}

function deleteAppointment(appointmentId) {
  const sheet = getSheet(SHEET.APPOINTMENTS);
  const data  = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] !== appointmentId) continue;
    if (new Date(data[i][2] + ' ' + data[i][3]) - new Date() < 24 * 60 * 60 * 1000)
      throw new Error('Cannot delete appointments within 24 hours');

    sendEmail(getUserEmail(data[i][1]), 'Appointment Cancelled', signEmail(
      `Dear Patient,\n\nYour appointment on ${data[i][2]} at ${data[i][3]} with Dr. ${data[i][5]} at ${data[i][4]} has been cancelled.`
    ));
    sheet.deleteRow(i + 1);
    return true;
  }
  throw new Error('Appointment not found');
}

function searchAppointments(username, searchDate) {
  const all = JSON.parse(getAppointments(username));
  return JSON.stringify(all.filter(a => a.date === searchDate));
}

// ─── Doctors ──────────────────────────────────────────────────────────────────
function getDoctors() {
  const data = getSheetData(SHEET.DOCTORS);
  const out  = [];
  for (let i = 1; i < data.length; i++) {
    out.push({ id: data[i][0], name: data[i][1], specialty: data[i][2] });
  }
  return out;
}

// ─── Prescriptions ────────────────────────────────────────────────────────────
function getPrescriptions(username) {
  const data = getSheetData(SHEET.PRESCRIPTIONS);
  const out  = [];
  for (let i = 1; i < data.length; i++) {
    if (data[i][1] === username) {
      out.push({ id: data[i][0], username: data[i][1], medication: data[i][2],
                 dosage: data[i][3], frequency: data[i][4], pharmacy: data[i][5],
                 nextRefillDate: data[i][6], lastRefillDate: data[i][7] });
    }
  }
  return JSON.stringify(out);
}

function createPrescription(rx) {
  const id    = Utilities.getUuid();
  const today = new Date();
  const next  = new Date(today.getTime() + rx.frequency * 24 * 60 * 60 * 1000);

  getSheet(SHEET.PRESCRIPTIONS).appendRow([id, rx.username, rx.medication, rx.dosage, rx.frequency, rx.pharmacy, next, today, new Date()]);
  sendEmail(getUserEmail(rx.username), 'Prescription Created', signEmail(
    `Dear Patient,\n\nYour prescription has been created:\n\nMedication: ${rx.medication}\nDosage: ${rx.dosage}mg\nFrequency: Every ${rx.frequency} days\nPharmacy: ${rx.pharmacy}`
  ));
  return id;
}

function editPrescription(prescriptionId, updated) {
  const sheet = getSheet(SHEET.PRESCRIPTIONS);
  const data  = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] !== prescriptionId) continue;
    const next = new Date(new Date(data[i][7]).getTime() + updated.frequency * 24 * 60 * 60 * 1000);

    sheet.getRange(i + 1, 3).setValue(updated.medication);
    sheet.getRange(i + 1, 4).setValue(updated.dosage);
    sheet.getRange(i + 1, 5).setValue(updated.frequency);
    sheet.getRange(i + 1, 6).setValue(updated.pharmacy);
    sheet.getRange(i + 1, 7).setValue(next);

    sendEmail(getUserEmail(data[i][1]), 'Prescription Updated', signEmail(
      `Dear Patient,\n\nYour prescription has been updated:\n\nMedication: ${updated.medication}\nDosage: ${updated.dosage}mg\nFrequency: Every ${updated.frequency} days\nPharmacy: ${updated.pharmacy}\nNext refill: ${next.toLocaleDateString()}`
    ));
    return true;
  }
  throw new Error('Prescription not found');
}

function deletePrescription(prescriptionId) {
  const sheet = getSheet(SHEET.PRESCRIPTIONS);
  const data  = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] !== prescriptionId) continue;
    sendEmail(getUserEmail(data[i][1]), 'Prescription Cancelled', signEmail(
      `Dear Patient,\n\nYour prescription for ${data[i][2]} at ${data[i][5]} has been cancelled.`
    ));
    sheet.deleteRow(i + 1);
    return true;
  }
  throw new Error('Prescription not found');
}

function refillPrescription(prescriptionId) {
  const sheet = getSheet(SHEET.PRESCRIPTIONS);
  const data  = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] !== prescriptionId) continue;
    if (new Date(data[i][6]) > new Date())
      throw new Error(`Cannot refill until ${new Date(data[i][6]).toLocaleDateString()}`);

    const today = new Date();
    const next  = new Date(today.getTime() + data[i][4] * 24 * 60 * 60 * 1000);
    sheet.getRange(i + 1, 7).setValue(next);
    sheet.getRange(i + 1, 8).setValue(today);

    sendEmail(getUserEmail(data[i][1]), 'Prescription Refilled', signEmail(
      `Dear Patient,\n\nYour prescription refill has been processed:\n\nMedication: ${data[i][2]}\nDosage: ${data[i][3]}mg\nPharmacy: ${data[i][5]}\nNext refill: ${next.toLocaleDateString()}`
    ));
    return true;
  }
  throw new Error('Prescription not found');
}

// ─── Patients ─────────────────────────────────────────────────────────────────
function buildPatientObject(row) {
  return {
    id: row[0], name: row[1], sex: row[2], gender: row[3],
    insuranceInfo: row[4], email: row[5], phone: row[6],
    guardians: JSON.parse(row[7]), medicalConditions: JSON.parse(row[8]),
    createdAt: row[9], deletionDate: row[10] || null,
    previousVersions: JSON.parse(row[11]),
    notes: row[13] || '', medicalHistory: row[14] || ''
  };
}

function addPatient(p) {
  if (!p.name || !p.sex || !p.email || !p.phone) throw new Error('Missing required patient information');

  const id = Utilities.getUuid();
  getSheet(SHEET.PATIENTS).appendRow([
    id, p.name, p.sex, p.gender || p.sex, p.insuranceInfo, p.email, p.phone,
    JSON.stringify(p.guardians || []), JSON.stringify(p.medicalConditions || []),
    new Date(), null, JSON.stringify([]), p.createdBy, p.notes || '', p.medicalHistory || ''
  ]);

  sendEmail(p.email, 'Patient History Created', signEmail(`Dear ${p.name},\n\nYour patient history has been created in the VCU Student Healthcare system.`));
  sendEmail(getUserEmail(p.createdBy), 'Patient Record Created', signEmail(`A new patient record has been created:\n\nName: ${p.name}\nEmail: ${p.email}\nPhone: ${p.phone}`));
  return id;
}

function searchPatients(query, providerUsername, password) {
  if (!validateProviderPassword(providerUsername, password)) throw new Error('Authentication failed');

  const data = getSheetData(SHEET.PATIENTS);
  const out  = [];
  for (let i = 1; i < data.length; i++) {
    if (data[i][1].toLowerCase().includes(query.toLowerCase())) {
      out.push({ id: data[i][0], name: data[i][1], sex: data[i][2], gender: data[i][3],
                 insuranceInfo: data[i][4], email: data[i][5], phone: data[i][6],
                 guardians: JSON.parse(data[i][7]), medicalConditions: JSON.parse(data[i][8]) });
    }
  }
  return out;
}

function getPatient(patientId, providerUsername, password) {
  if (!validateProviderPassword(providerUsername, password)) throw new Error('Authentication failed');

  const data = getSheetData(SHEET.PATIENTS);
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === patientId) return JSON.stringify(buildPatientObject(data[i]));
  }
  throw new Error('Patient not found');
}

function updatePatient(patientId, updated, providerUsername, password) {
  if (!validateProviderPassword(providerUsername, password)) throw new Error('Authentication failed');

  const sheet = getSheet(SHEET.PATIENTS);
  const data  = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] !== patientId) continue;

    const history = JSON.parse(data[i][11]);
    history.push({ data: buildPatientObject(data[i]), timestamp: new Date().toISOString() });

    sheet.getRange(i + 1, 2).setValue(updated.name);
    sheet.getRange(i + 1, 3).setValue(updated.sex);
    sheet.getRange(i + 1, 4).setValue(updated.gender);
    sheet.getRange(i + 1, 5).setValue(updated.insuranceInfo);
    sheet.getRange(i + 1, 6).setValue(updated.email);
    sheet.getRange(i + 1, 7).setValue(updated.phone);
    sheet.getRange(i + 1, 8).setValue(JSON.stringify(updated.guardians));
    sheet.getRange(i + 1, 9).setValue(JSON.stringify(updated.medicalConditions));
    sheet.getRange(i + 1, 12).setValue(JSON.stringify(history));
    sheet.getRange(i + 1, 14).setValue(updated.notes);
    sheet.getRange(i + 1, 15).setValue(updated.medicalHistory);

    sendEmail(updated.email, 'Patient History Updated', signEmail(
      `Dear ${updated.name},\n\nYour patient history has been updated. If you did not authorize these changes, please contact us immediately.`
    ));
    return true;
  }
  throw new Error('Patient not found');
}

function markPatientForDeletion(patientId, providerUsername, password) {
  if (!validateProviderPassword(providerUsername, password)) throw new Error('Authentication failed');

  const sheet = getSheet(SHEET.PATIENTS);
  const data  = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] !== patientId) continue;
    const deletionDate = new Date();
    deletionDate.setDate(deletionDate.getDate() + 7);
    sheet.getRange(i + 1, 11).setValue(deletionDate);

    sendEmail(data[i][5], 'Patient Record Scheduled for Deletion', signEmail(
      `Dear ${data[i][1]},\n\nYour patient record is scheduled to be deleted on ${deletionDate.toLocaleDateString()}. If you did not request this, please contact us immediately.`
    ));
    return deletionDate;
  }
  throw new Error('Patient not found');
}

function cancelPatientDeletion(patientId, providerUsername, password) {
  if (!validateProviderPassword(providerUsername, password)) throw new Error('Authentication failed');

  const sheet = getSheet(SHEET.PATIENTS);
  const data  = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] !== patientId) continue;
    sheet.getRange(i + 1, 11).setValue(null);
    sendEmail(data[i][5], 'Patient Record Deletion Cancelled', signEmail(
      `Dear ${data[i][1]},\n\nThe scheduled deletion of your patient record has been cancelled. Your records will remain in our system.`
    ));
    return true;
  }
  throw new Error('Patient not found');
}

function undoPatientChanges(patientId, providerUsername, password) {
  if (!validateProviderPassword(providerUsername, password)) throw new Error('Authentication failed');

  const sheet = getSheet(SHEET.PATIENTS);
  const data  = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] !== patientId) continue;
    const history = JSON.parse(data[i][11]);
    if (!history.length) throw new Error('No previous versions available');

    const last = history[history.length - 1];
    if (new Date(last.timestamp) < new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))
      throw new Error('Changes cannot be undone after one week');

    const prev = last.data;
    sheet.getRange(i + 1, 2).setValue(prev.name);
    sheet.getRange(i + 1, 3).setValue(prev.sex);
    sheet.getRange(i + 1, 4).setValue(prev.gender);
    sheet.getRange(i + 1, 5).setValue(prev.insuranceInfo);
    sheet.getRange(i + 1, 6).setValue(prev.email);
    sheet.getRange(i + 1, 7).setValue(prev.phone);
    sheet.getRange(i + 1, 8).setValue(JSON.stringify(prev.guardians));
    sheet.getRange(i + 1, 9).setValue(JSON.stringify(prev.medicalConditions));
    history.pop();
    sheet.getRange(i + 1, 11).setValue(null);
    sheet.getRange(i + 1, 12).setValue(JSON.stringify(history));

    sendEmail(prev.email, 'Patient History Reverted', signEmail(
      `Dear ${prev.name},\n\nRecent changes to your patient history have been undone. If you did not authorize this action, please contact us immediately.`
    ));
    return true;
  }
  throw new Error('Patient not found');
}
