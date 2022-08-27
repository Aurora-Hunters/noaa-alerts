/**
 * Get color for target KP index
 *
 * @param {number} kIndex
 */
module.exports = (kIndex) => {
  if (kIndex <= 2) return '#1e3731fa';
  if (kIndex <= 3) return '#3c6322fa';
  if (kIndex <= 4) return '#919733fa';
  if (kIndex <= 5) return '#804b19fa';
  if (kIndex <= 6) return '#58212afa';
  if (kIndex <= 7) return '#40253bfa';
  if (kIndex <= 8) return '#232d40fa';
  if (kIndex <= 9) return '#000000fa';
}
