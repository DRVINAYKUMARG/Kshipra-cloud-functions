import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js";
import {
  getFirestore,
  doc,
  getDoc,
  updateDoc,
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDtCblt1HvfLfRC5cVJQdwyLinczt3fWaY",
  authDomain: "kshipra-study-partner.firebaseapp.com",
  projectId: "kshipra-study-partner",
  storageBucket: "kshipra-study-partner.firebasestorage.app",
  messagingSenderId: "341570955598",
  appId: "1:341570955598:web:ed8fbd11f42fa1086e961f",
  measurementId: "G-JMPQB3D5E7",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const urlParams = new URLSearchParams(window.location.search);
const action = urlParams.get("action");
const sessionId = urlParams.get("sessionId");

const title = document.getElementById("title");
const input = document.getElementById("inputField");
const confirmBtn = document.getElementById("confirmBtn");
const result = document.getElementById("result");

console.log("confirm page action:", action);

console.log("Session ID from URL:", sessionId);

function formatDurationValue(value) {
  if (value === null || value === undefined || value === "") return "";

  if (typeof value === "number" && Number.isFinite(value)) {
    if (value % 60 === 0) {
      const hours = value / 60;
      return `${hours} ${hours === 1 ? "hour" : "hours"}`;
    }

    if (value > 60) {
      const hours = Math.floor(value / 60);
      const minutes = value % 60;
      return `${hours} ${hours === 1 ? "hour" : "hours"} ${minutes} mins`;
    }

    return `${value} mins`;
  }

  const text = String(value).trim();
  if (!text) return "";

  const numericText = Number(text);
  if (Number.isFinite(numericText) && text === String(numericText)) {
    return formatDurationValue(numericText);
  }

  return text;
}

function getSessionDuration(session) {
  const durationCandidates = [
    session.duration,
    session.sessionDuration,
    session.durationText,
    session.selectedDuration,
    session.planDuration,
    session.durationMinutes,
    session.durationInMinutes,
    session.sessionDurationMinutes,
    session.minutes,
    session.slotDuration,
  ];

  for (const value of durationCandidates) {
    const formatted = formatDurationValue(value);
    if (formatted) return formatted;
  }

  return "-";
}

function normalizeMeetingLink(rawLink) {
  const cleaned = String(rawLink || "")
    .trim()
    .replace(/^<|>$/g, "");

  if (!cleaned) return "";

  let normalized = cleaned;
  if (/^(meet\.google\.com|zoom\.us|[\w-]+\.zoom\.us|teams\.microsoft\.com)\//i.test(normalized)) {
    normalized = `https://${normalized}`;
  }

  try {
    const url = new URL(normalized);
    if (!["http:", "https:"].includes(url.protocol)) return "";
    return url.href;
  } catch (error) {
    return "";
  }
}

function buildMeetingLinkUpdate(rawLink) {
  const meetingLink = normalizeMeetingLink(rawLink);

  return {
    meetingLink,
    meetingUrl: meetingLink,
    meetingURL: meetingLink,
    meeting_link: meetingLink,
  };
}

window.addEventListener("DOMContentLoaded", function () {
  if (!sessionId) {
    showMessage(
      "❌ Error: No session ID provided in URL. Please check the email link.",
      "error",
    );
    console.error("No sessionId in URL");
    return;
  }

  // Load from Firestore
  loadSessionDataFromFirebase(sessionId);
});

// Only touch confirm-page elements if they exist on the current page
if (title && input) {
  const meetingLinkSection = document.getElementById("meetingLinkSection");
  const meetingLinkInput = document.getElementById("meetingLink");

  if (action === "accept") {
    title.textContent = "Approve Session";
    input.placeholder = "Add custom notes for student (optional)";

    // Show meeting link field on accept page
    if (meetingLinkSection) {
      meetingLinkSection.style.display = "block";
    }
  } else {
    title.textContent = "Reject Session";
    input.placeholder = "Enter rejection reason";

    // Hide meeting link field on reject page
    if (meetingLinkSection) {
      meetingLinkSection.style.display = "none";
    }
  }

  // Confirm button (only if present)
  if (confirmBtn) {
    confirmBtn.onclick = async () => {
      const value = input.value;
      const meetingLink = action === "accept" ? normalizeMeetingLink(document.getElementById("meetingLink")?.value) : null;

      if (action === "reject" && !value.trim()) {
        alert("Reason is required");
        return;
      }

      if (action === "accept") {
        // On accept, meeting link is required
        if (!meetingLink) {
          alert("Please enter a valid meeting link");
          return;
        }
      }

      const sessionRef = doc(db, "sessions", sessionId);

      const sessionSnap = await getDoc(sessionRef);
      const sessionData = sessionSnap.data();
      const orderId = sessionData.orderId;

      console.log('orderId:', orderId);

      if (!orderId) {
        console.error('No orderId found in sessionData');
        showMessage("❌ Error: Order ID not found.", "error");
        return;
      }

      try {
        if (action === "accept") {
          await updateDoc(sessionRef, {
            mentorStatus: "accepted",
            mentorNotes: value,
            ...buildMeetingLinkUpdate(meetingLink),
            updatedAt: new Date().toISOString(),
          });

          const orderRef = doc(db, "userOrders", orderId);
          await updateDoc(orderRef, {
            mentorStatus: "accepted",
            mentorNotes: value,
            ...buildMeetingLinkUpdate(meetingLink),
            updatedAt: new Date().toISOString(),
          });

          showSuccess("Session Approved Successfully 🎉");
        } else {
          await updateDoc(sessionRef, {
            mentorStatus: "rejected",
            rejectionReason: value,
            updatedAt: new Date().toISOString(),
          });

          const orderRef = doc(db, "userOrders", orderId);
          await updateDoc(orderRef, {
            mentorStatus: "rejected",
            mentorNotes: value,
            updatedAt: new Date().toISOString(),
          });

          showSuccess("Session Rejected");
        }
        console.log('Updated userOrders successfully');
      } catch (error) {
        console.error('Error updating userOrders:', error);
        showMessage("❌ Error updating order status. Please try again.", "error");
      }
    };
  }
}

function showSuccess(message) {
  document.querySelector(".container").innerHTML = `<h2>${message}</h2>`;
}

/**
 * Load session data from Firestore
 * @param {string} sessionId - The session document ID
 */
async function loadSessionDataFromFirebase(sessionId) {
  try {
    console.log("Loading session from Firestore:", sessionId);

    const sessionRef = doc(db, "sessions", sessionId);
    const sessionSnap = await getDoc(sessionRef);

    if (sessionSnap.exists()) {
      const data = sessionSnap.data();
      loadSessionData(data);
      console.log("✓ Session data loaded from Firestore:", data);
    } else {
      showMessage(
        "❌ Session not found. The session ID is invalid or expired.",
        "error",
      );
      console.error("No session document found with ID:", sessionId);
    }
  } catch (error) {
    console.error("Error loading session:", error);
    const errMsg = error && error.message ? error.message : String(error);
    showMessage(
      `❌ Error loading session data: ${errMsg}. Please check your internet connection and try again.`,
      "error",
    );
  }
}

/**
 * Update session status in Firestore
 * @param {string} status - Either 'accepted' or 'rejected'
 */
async function updateSessionStatus(status) {
  try {
    if (!sessionId) {
      showMessage("❌ Cannot update - no session ID", "error");
      return;
    }

    console.log("Updating session status:", status);

    const sessionRef = doc(db, "sessions", sessionId);
    await updateDoc(sessionRef, {
      mentorStatus: status,
      updatedAt: new Date().toISOString(),
    });

    if (status === "accepted") {
      showMessage(
        "✓ Session approved successfully! Student has been notified.",
        "success",
      );
    } else {
      showMessage("✕ Session rejected. Student has been notified.", "error");
    }

    console.log("✓ Session status updated to:", status);

    // Disable buttons after update
    document.querySelector(".btn-primary").disabled = true;
    document.querySelector(".btn-secondary").disabled = true;
  } catch (error) {
    console.error("Error updating session:", error);
    showMessage("❌ Error updating session. Please try again.", "error");

    // Re-enable buttons on error
    document.querySelector(".btn-primary").disabled = false;
    document.querySelector(".btn-secondary").disabled = false;
  }
}

/**
 * Load session data into the DOM
 * @param {object} session - Session data object with all fields
 */
function loadSessionData(session) {
  // Helper: set text only if element exists to avoid "Cannot set properties of null"
  function setTextIfExists(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  // Session Information
  setTextIfExists("topic", session.topic || "-");
  setTextIfExists("date", session.date || "-");
  setTextIfExists("time", session.time || "-");
  setTextIfExists("duration", getSessionDuration(session));
  setTextIfExists("price", session.price || "-");

  // Student Information (mask only email and phone)
  setTextIfExists("studentName", session.studentName || "-");
// setTextIfExists("studentName", session.studentEmail || "-");
// setTextIfExists("studentName", session.studentPhone || "-");
  setTextIfExists("studentEmail", maskEmail(session.studentEmail || "-"));
  setTextIfExists("studentPhone", maskPhone(session.studentPhone || "-"));

  // Check if mentor has already responded (not pending)
  if (session.mentorStatus && session.mentorStatus !== "pending") {
    // Hide action buttons
    const actionsDiv = document.querySelector(".actions");
    if (actionsDiv) {
      actionsDiv.style.display = "none";
    }

    // Show status message
    const messageDiv = document.getElementById("message");
    if (messageDiv) {
      let message = "";
      if (session.mentorStatus === "accepted") {
        message = "✓ You have already approved this session.";
        messageDiv.className = "message success";
      } else if (session.mentorStatus === "rejected") {
        message = "✕ You have already rejected this session.";
        messageDiv.className = "message error";
      }
      else if (session.mentorStatus === "auto_rejected") {
        message = "✕ Session auto-cancelled due to no response 1 hour before start time.";
        messageDiv.className = "message error";
      }
      messageDiv.innerHTML = message;
      messageDiv.style.display = "flex";
    }
  }

  console.log("Session data populated on page");
}

// Privacy helpers for mentor view
function maskName(name) {
  if (!name || name === "-") return "-";
  const parts = String(name).trim().split(" ").filter(Boolean);
  if (!parts.length) return "-";
  return parts
    .map((part) => {
      if (part.length <= 2) return "*".repeat(part.length);
      const middleStars = "***";
      return `${part[0]}${middleStars}${part[part.length - 1]}`;
    })
    .join(" ");
}

function maskEmail(email) {
  if (!email || email === "-") return "-";
  const cleaned = String(email).trim();
  const [local, domain] = cleaned.split("@");
  if (!local || !domain) return "***";

  const maskedLocal = local.length <= 2 ? "**" : `${local[0]}***${local[local.length - 1]}`;
  const domainParts = domain.split(".");
  if (domainParts.length < 2) {
    return `${maskedLocal}@***`;
  }

  const host = domainParts[0];
  const rest = domainParts.slice(1).join(".");
  const maskedHost = host.length <= 2 ? "**" : `${host[0]}***${host[host.length - 1]}`;

  return `${maskedLocal}@${maskedHost}.${rest}`;
}

function maskPhone(phone) {
  if (!phone || phone === "-") return "-";
  const digits = String(phone).replace(/\D/g, "");
  if (!digits) return "-";
  if (digits.length <= 4) return "*".repeat(digits.length);
  const visible = digits.slice(-4);
  return "*".repeat(digits.length - 4) + visible;
}

function handleAccept() {
  console.log("handleAccept called");
  document.getElementById("acceptModal").style.display = "flex";
}

function handleReject() {
  document.getElementById("rejectModal").style.display = "flex";
}

async function confirmAccept() {
  console.log("confirmAccept called");
  const notes = document.getElementById("acceptNotes").value;
  const meetingLink = normalizeMeetingLink(document.getElementById("meetingLink").value);

  if (!meetingLink) {
    alert("Please enter a valid meeting link");
    return;
  }

  const sessionRef = doc(db, "sessions", sessionId);

  const sessionSnap = await getDoc(sessionRef);
  const sessionData = sessionSnap.data();
  console.log('sessionData:', sessionData);
  const orderId = sessionData.orderId;

  console.log('orderId:', orderId);

  if (!orderId) {
    console.error('No orderId found in sessionData');
    showMessage("❌ Error: Order ID not found.", "error");
    return;
  }

  await updateDoc(sessionRef, {
    mentorStatus: "accepted",
    mentorNotes: notes,
    ...buildMeetingLinkUpdate(meetingLink),
    updatedAt: new Date().toISOString(),
  });

  try {
    const orderRef = doc(db, "userOrders", orderId);
    await updateDoc(orderRef, {
      mentorStatus: "accepted",
      mentorNotes: notes,
      ...buildMeetingLinkUpdate(meetingLink),
      updatedAt: new Date().toISOString(),
    });
    console.log('Updated userOrders successfully');
  } catch (error) {
    console.error('Error updating userOrders:', error);
    showMessage("❌ Error updating order status. Please try again.", "error");
    return;
  }

  closeModal("acceptModal");
  showMessage("✓ Session approved successfully!", "success");
}

async function confirmReject() {
  console.log("confirmReject called");
  const reason = document.getElementById("rejectReason").value;

  if (!reason.trim()) {
    alert("Please enter rejection reason");
    return;
  }

  const sessionRef = doc(db, "sessions", sessionId);

  const sessionSnap = await getDoc(sessionRef);
  const sessionData = sessionSnap.data();
  console.log('sessionData:', sessionData);
  const orderId = sessionData.orderId;
    console.log('orderId...',orderId);

  if (!orderId) {
    console.error('No orderId found in sessionData');
    showMessage("❌ Error: Order ID not found.", "error");
    return;
  }
    
  await updateDoc(sessionRef, {
    mentorStatus: "rejected",
    rejectionReason: reason,
    updatedAt: new Date().toISOString(),
  });

   try {
     const orderRef = doc(db, "userOrders", orderId);
     await updateDoc(orderRef, {
       mentorStatus: "rejected",
       updatedAt: new Date().toISOString(),
     });
     console.log('Updated userOrders successfully');
   } catch (error) {
     console.error('Error updating userOrders:', error);
     showMessage("❌ Error updating order status. Please try again.", "error");
     return;
   }

  closeModal("rejectModal");
  showMessage("✕ Session rejected", "error");
}

function closeModal(id) {
  document.getElementById(id).style.display = "none";
}

function goToConfirm(action) {
  if (!sessionId) {
    alert("No session ID found");
    return;
  }

  window.location.href = `confirm.html?action=${action}&sessionId=${sessionId}`;
}

/**
 * Display message to user
 * @param {string} text - Message text to display
 * @param {string} type - Message type: 'success' or 'error'
 */
function showMessage(text, type) {
  const messageDiv = document.getElementById("message");
  if (!messageDiv) {
    alert(text);
    return;
  }

  messageDiv.innerHTML = text;
  messageDiv.className = "message " + type;

  console.log(`[${type.toUpperCase()}] ${text}`);

  // Auto-hide message after 4 seconds (only for success messages)
  if (type === "success") {
    setTimeout(() => {
      messageDiv.className = "message";
    }, 4000);
  }
}

if (document.getElementById("acceptBtn")) {
  document.getElementById("acceptBtn").addEventListener("click", () => {
    goToConfirm("accept");
  });
}

if (document.getElementById("rejectBtn")) {
  document.getElementById("rejectBtn").addEventListener("click", () => {
    goToConfirm("reject");
  });
}


window.handleAccept = handleAccept;
window.handleReject = handleReject;
window.confirmAccept = confirmAccept;
window.confirmReject = confirmReject;
window.closeModal = closeModal;
window.goToConfirm = goToConfirm;
