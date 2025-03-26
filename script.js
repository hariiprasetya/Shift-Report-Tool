// script.js
document.addEventListener("DOMContentLoaded", function () {
  const today = new Date();
  const dateStr = today.toISOString().split("T")[0];
  document.getElementById("date").value = dateStr;
});

// Shared file reading function
function readFile(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      resolve(e.target.result);
    };
    reader.readAsText(file);
  });
}

function getShiftHeader(shift) {
  const shiftHeaders = {
    A: "Selamat sore, berikut rekap shift problem Zabbix monitoring IFG pada akhir shift A",
    C: "Selamat malam, berikut rekap shift problem Zabbix monitoring IFG pada akhir shift C",
    M: "Selamat pagi, berikut rekap shift problem Zabbix monitoring IFG pada akhir shift M",
    D: "Selamat malam, berikut rekap daily problem Zabbix monitoring IFG",
  };
  return (
    shiftHeaders[shift] ||
    "Selamat malam, berikut rekap problem Zabbix monitoring IFG"
  );
}

function analyzeCSV() {
  const file1 = document.getElementById("csvFile1").files[0];
  const file2 = document.getElementById("csvFile2").files[0];
  const shift = document.getElementById("shift").value;
  const operatorName = document.getElementById("operatorName").value;
  const date = document.getElementById("date").value;
  const reportArea = document.getElementById("report");

  if (!file1 && !file2) return alert("Silakan unggah minimal satu file CSV!");

  const readers = [];
  if (file1) readers.push(readFile(file1));
  if (file2) readers.push(readFile(file2));

  Promise.all(readers).then((contents) => {
    const allRows = [];
    const seenProblems = new Set();

    contents.forEach((content) => {
      const rows = content
        .split("\n")
        .map((row) =>
          row.split('","').map((cell) => cell.replace(/^"|"$/g, ""))
        )
        .slice(1);

      rows.forEach((row) => {
        if (row[3] !== "PROBLEM" && row[3] !== "RESOLVED") return;

        const durationMs = parseDuration(row[7]);
        if (durationMs < 3600000) return;

        const problemKey = `${row[4]}-${row[1]}-${row[5]}`;
        if (!seenProblems.has(problemKey)) {
          seenProblems.add(problemKey);
          allRows.push(row);
        }
      });
    });

    const groups = {
      nonFollowUp: { Space: [], Memory: [], Temperature: [], Other: [] },
      followUp: { Space: [], Memory: [], Temperature: [], Other: [] },
    };

    allRows.forEach((row) => {
      const durationMs = parseDuration(row[7]);
      const status = row[3] === "PROBLEM" ? "Belum Resolved" : "Resolved";
      const entry = `- ${row[4]}  Durasi: ${standardizeDuration(
        row[7]
      )} (start ${formatDate(row[1])})  (${
        row[10]?.match(/IFG-\d+/) || "N/A"
      })  *${status}*`;
      const group = row[5].includes("Space")
        ? "Space"
        : row[5].includes("memory")
        ? "Memory"
        : row[5].includes("Temperature")
        ? "Temperature"
        : "Other";

      (durationMs < 86400000 ? groups.nonFollowUp : groups.followUp)[
        group
      ].push(entry);
    });

    let report = `${getShiftHeader(shift)}\n${getShiftDateRange(
      shift,
      date
    )}\n\n`;

    for (const [type, group] of [
      ["", "nonFollowUp"],
      ["Follow Up Report:\n\n", "followUp"],
    ]) {
      report += type;
      for (const g in groups[group]) {
        if (groups[group][g].length) {
          report += `${
            g === "Space"
              ? "Space is critically low"
              : g === "Memory"
              ? "High memory utilization"
              : g
          }\n${groups[group][g].join("\n")}\n\n`;
        }
      }
    }

    report += `Terima kasih\nFDS Monitoring - ${operatorName}`;
    reportArea.value = report;
  });
}

function exportToPDF() {
  const file1 = document.getElementById("csvFile1").files[0];
  const file2 = document.getElementById("csvFile2").files[0];
  const shift = document.getElementById("shift").value;
  const operatorName = document.getElementById("operatorName").value;
  const date = document.getElementById("date").value;

  if (!file1 && !file2) return alert("Upload at least one CSV file first!");

  const readers = [];
  if (file1) readers.push(readFile(file1));
  if (file2) readers.push(readFile(file2));

  Promise.all(readers).then((contents) => {
    const allRows = [];
    const seenProblems = new Set();

    contents.forEach((content) => {
      const rows = content
        .split("\n")
        .map((row) =>
          row.split('","').map((cell) => cell.replace(/^"|"$/g, ""))
        )
        .slice(1);

      rows.forEach((row) => {
        if (row[3] !== "PROBLEM" && row[3] !== "RESOLVED") return;

        const durationMs = parseDuration(row[7]);
        if (durationMs < 3600000) return;

        const problemKey = `${row[4]}-${row[1]}-${row[5]}`;
        if (!seenProblems.has(problemKey)) {
          seenProblems.add(problemKey);
          allRows.push(row);
        }
      });
    });

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    // Set font to Times New Roman
    doc.setFont("Times", "normal");

    // Get operator full name
    const fullNameMap = {
      Anissa: "Anissa Tun Sa'adah",
      Armin: "Armin Hasni",
      Agung: "Agung Hardianto",
      Alif: "Alif Anandhito Bagoes Rekotomo",
      Aaqil: "Muhammad Irsyad Aqil",
      Harry: "Harry Prasetya",
      Tegar: "Tegar Kartawiyuda",
      Udin: "Nur Khoerudin",
    };
    const fullName = fullNameMap[operatorName] || operatorName;

    // Header - Centered and Bold
    doc.setFontSize(14);
    doc.setFont("Times", "bold");
    doc.text("IFG Zabbix Monitoring Issue Summary", 105, 15, {
      align: "center",
    });

    // Period and Created By - Centered and Bold
    doc.setFontSize(11);
    doc.text(`Period: ${getShiftDateRange(shift, date)}`, 105, 25, {
      align: "center",
    });
    doc.text(`Created By: FDS Monitoring - ${fullName}`, 105, 30, {
      align: "center",
    });

    const categories = {
      "Space is Critically Low (Used>90%)": [],
      "Windows: High Memory Utilization (>90% for 5m)": [],
      "CPU Temp: Temperature is above warning threshold: >70°": [],
      "Other Issues": [],
    };

    allRows.forEach((row) => {
      const host = row[4];
      const duration = standardizeDuration(row[7]);
      const timeStart = formatDate(row[1]);
      const ticketId = row[10]?.match(/IFG-\d+/) || "N/A";
      const status = row[3] === "PROBLEM" ? "Belum Resolved" : "Resolved";
      const trigger = row[5].toLowerCase();

      const entry = [host, duration, timeStart, ticketId, status];

      if (trigger.includes("space")) {
        categories["Space is Critically Low (Used>90%)"].push(entry);
      } else if (trigger.includes("memory")) {
        categories["Windows: High Memory Utilization (>90% for 5m)"].push(
          entry
        );
      } else if (trigger.includes("temperature")) {
        categories[
          "CPU Temp: Temperature is above warning threshold: >70°"
        ].push(entry);
      } else {
        categories["Other Issues"].push(entry);
      }
    });

    // Generate tables for each category
    let yPos = 40;
    Object.entries(categories).forEach(([category, data]) => {
      if (data.length > 0) {
        // Category title - Bold
        doc.setFontSize(11);
        doc.setFont("Times", "bold");
        doc.text(category, 14, yPos);
        yPos += 7;

        // Table with centered headers and no background color
        doc.autoTable({
          startY: yPos,
          head: [["Host", "Duration", "Time Start", "Ticket ID", "Status"]],
          body: data,
          headStyles: {
            fontStyle: "bold",
            font: "Times",
            textColor: [0, 0, 0],
            fillColor: [255, 255, 255],
            halign: "center",
          },
          columnStyles: {
            0: { halign: "left" },
            1: { halign: "center" },
            2: { halign: "center" },
            3: { halign: "center" },
            4: { halign: "center" },
          },
          bodyStyles: {
            font: "Times",
            halign: "center",
          },
          styles: {
            font: "Times",
            fontSize: 10,
            cellPadding: 3,
            valign: "middle",
          },
          margin: { left: 14 },
          theme: "grid",
        });

        yPos = doc.lastAutoTable.finalY + 10;
      }
    });

    // Save PDF
    doc.save(`Zabbix_Report_${date}.pdf`);
  });
}

// Helper functions
function parseDuration(str) {
  return Object.entries({
    M: 30 * 86400,
    d: 86400,
    h: 3600,
    m: 60,
    s: 1,
  }).reduce(
    (ms, [unit, sec]) =>
      ms + (parseInt(str.match(`(\\d+)${unit}`)?.[1]) || 0) * sec * 1000,
    0
  );
}

function standardizeDuration(str) {
  const ms = parseDuration(str);
  const months = Math.floor(ms / (30 * 86400000));
  const days = Math.floor((ms % (30 * 86400000)) / 86400000);
  const hours = Math.floor((ms % 86400000) / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);

  return ms < 86400000
    ? `${hours} jam ${minutes} menit`
    : months
    ? `${months} bulan ${days} hari ${hours} jam`
    : `${days} hari ${hours} jam ${minutes} menit`;
}

function formatDate(str) {
  return new Date(str).toLocaleString("en-US", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  });
}

function getShiftDateRange(shift, date) {
  const d = new Date(date);
  const shifts = {
    A: [6, 15], // Shift A: 06:00-15:00
    C: [14, 23], // Shift C: 14:00-23:00
    M: [22, 7, 1], // Shift M: 22:00-07:00 (next day)
    D: [0, 23, 0, true], // Full Day: 00:00-23:59
  };

  const [startHour, endHour, nextDay = 0, isFullDay = false] = shifts[shift];
  const start = new Date(d.setHours(startHour, 0, 0, 0));
  const end = new Date(
    d.setHours(endHour, isFullDay ? 59 : 0, isFullDay ? 59 : 0, 0)
  );
  if (nextDay) end.setDate(d.getDate() + 1);

  const fmt = (d) => {
    if (isFullDay) {
      return `${String(d.getDate()).padStart(2, "0")}/${String(
        d.getMonth() + 1
      ).padStart(2, "0")}/${d.getFullYear()} ${String(d.getHours()).padStart(
        2,
        "0"
      )}:${String(d.getMinutes()).padStart(2, "0")}`;
    }
    return `${String(d.getDate()).padStart(2, "0")}/${String(
      d.getMonth() + 1
    ).padStart(2, "0")}/${d.getFullYear()} ${String(d.getHours()).padStart(
      2,
      "0"
    )}:00`;
  };

  return isFullDay
    ? `${fmt(start)} - ${fmt(end)}`
    : `${fmt(start)} - ${fmt(end)}`;
}

function getGreetingTime() {
  const hour = new Date().getHours();
  if (hour < 10) return "pagi";
  if (hour < 15) return "siang";
  if (hour < 19) return "sore";
  return "malam";
}
