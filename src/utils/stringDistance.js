export function levenshteinDistance(str1, str2) {
  const len1 = str1.length;
  const len2 = str2.length;
  const matrix = [];

  if (len1 === 0) return len2;
  if (len2 === 0) return len1;

  for (let i = 0; i <= len2; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= len1; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= len2; i++) {
    for (let j = 1; j <= len1; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[len2][len1];
}

export function damerauLevenshteinOSA(a, b) {
  const n = a.length, m = b.length;
  if (n === 0) return m;
  if (m === 0) return n;

  let prev2 = new Int32Array(m + 1);
  let prev1 = new Int32Array(m + 1);
  for (let j = 0; j <= m; j++) prev1[j] = j;

  let curr = new Int32Array(m + 1);
  for (let i = 1; i <= n; i++) {
    curr[0] = i;
    const ai = a.charCodeAt(i - 1);
    for (let j = 1; j <= m; j++) {
      const cost = ai === b.charCodeAt(j - 1) ? 0 : 1;
      let v = prev1[j - 1] + cost;
      const ins = curr[j - 1] + 1;
      if (ins < v) v = ins;
      const del = prev1[j] + 1;
      if (del < v) v = del;

      if (i > 1 && j > 1 &&
          ai === b.charCodeAt(j - 2) &&
          a.charCodeAt(i - 2) === b.charCodeAt(j - 1)) {
        const trans = prev2[j - 2] + 1;
        if (trans < v) v = trans;
      }

      curr[j] = v;
    }
    prev2 = prev1;
    prev1 = curr;
    curr = new Int32Array(m + 1);
  }

  return prev1[m];
}
