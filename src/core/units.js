// Length and area formatting / parsing. All internal values are in feet.

export function fmtFt(ft, { precise = false } = {}) {
  if (ft == null || !isFinite(ft)) return '—';
  const neg = ft < 0;
  let a = Math.abs(ft);
  let feet = Math.floor(a);
  let inches = (a - feet) * 12;
  if (precise) {
    inches = Math.round(inches * 4) / 4; // quarter inch
  } else {
    inches = Math.round(inches);
  }
  if (inches >= 12) { feet += 1; inches -= 12; }
  const inStr = Number.isInteger(inches) ? String(inches) : inches.toFixed(2).replace(/0+$/, '');
  let s;
  if (feet === 0) s = `${inStr}"`;
  else if (inches === 0) s = `${feet}'`;
  else s = `${feet}' ${inStr}"`;
  return (neg ? '-' : '') + s;
}

export function fmtArea(sqft) {
  if (sqft == null || !isFinite(sqft)) return '—';
  return `${Math.round(sqft).toLocaleString()} sq ft`;
}

export function fmtNum(n, d = 1) {
  return Number(n).toLocaleString(undefined, { maximumFractionDigits: d });
}

// Parse user length input into feet.
// Accepts: 12  12.5  12'  12'6"  12' 6  12ft 6in  6"  6in  150in  12-6  3m
export function parseLength(input) {
  if (input == null) return null;
  let s = String(input).trim().toLowerCase();
  if (!s) return null;
  s = s.replace(/[’′]/g, "'").replace(/[”″]/g, '"').replace(/feet|foot/g, 'ft').replace(/inches|inch/g, 'in');

  let m;
  // meters / centimeters
  if ((m = s.match(/^(-?\d*\.?\d+)\s*m$/))) return parseFloat(m[1]) * 3.28084;
  if ((m = s.match(/^(-?\d*\.?\d+)\s*cm$/))) return parseFloat(m[1]) * 0.0328084;
  // inches only
  if ((m = s.match(/^(-?\d*\.?\d+)\s*(in|")$/))) return parseFloat(m[1]) / 12;
  // feet and inches
  if ((m = s.match(/^(-?\d*\.?\d+)\s*(ft|')\s*-?\s*(\d*\.?\d+)?\s*(in|")?$/))) {
    const ft = parseFloat(m[1]);
    const inch = m[3] ? parseFloat(m[3]) : 0;
    return ft < 0 ? ft - inch / 12 : ft + inch / 12;
  }
  // 12-6 means 12 ft 6 in
  if ((m = s.match(/^(\d+)-(\d*\.?\d+)$/))) return parseInt(m[1], 10) + parseFloat(m[2]) / 12;
  // plain number = feet
  if ((m = s.match(/^-?\d*\.?\d+$/))) return parseFloat(s);
  return null;
}

// Parse "40x30", "40' x 30'", "40,30" into [w, h] feet
export function parsePair(input) {
  if (!input) return null;
  const parts = String(input).split(/\s*[x×,*]\s*/i);
  if (parts.length !== 2) return null;
  const a = parseLength(parts[0]);
  const b = parseLength(parts[1]);
  if (a == null || b == null) return null;
  return [a, b];
}
