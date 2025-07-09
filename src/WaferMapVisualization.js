import React from 'react';
import './WaferMapVisualization.css';

function WaferMapVisualization({ mapData }) {
  if (!mapData) return null;

  const rows = parseInt(mapData.header.Rows);
  const cols = parseInt(mapData.header.Columns);
  const binCounts = new Map();

  // Count bins
  for (const [_, status] of mapData.dies) {
    binCounts.set(status, (binCounts.get(status) || 0) + 1);
  }

  // Wafer circle parameters
  const centerX = (cols - 1) / 2;
  const centerY = (rows - 1) / 2;
  // Use 0.98 to leave a small margin
  const radius = Math.min(centerX, centerY) * 0.98;

  // Create grid for visualization
  const grid = [];
  for (let y = 0; y < rows; y++) {
    const row = [];
    for (let x = 0; x < cols; x++) {
      const coord = `${x},${y}`;
      const status = mapData.dies.get(coord) || "FF";
      // Calculate distance from center
      const dx = x - centerX;
      const dy = y - centerY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      // Only show dies within the wafer circle
      row.push({
        status,
        inWafer: dist <= radius
      });
    }
    grid.push(row);
  }

  // Bin color mapping
  const binColors = {
    "01": "#4CAF50", // Pass - Green
    "EF": "#F44336", // Defect - Red
    "FA": "#2196F3", // Reference - Blue
    "FF": "#E0E0E0", // Null - Gray
    "FC": "#FF9800", // Fail Code - Orange
  };

  return (
    <div className="wafer-map-visualization">
      <div className="map-container">
        <div className="grid">
          {grid.map((row, y) => (
            <div key={y} className="row">
              {row.map((cell, x) => (
                <div
                  key={`${x}-${y}`}
                  className="cell"
                  style={{
                    backgroundColor: cell.inWafer ? (binColors[cell.status] || "#9E9E9E") : "transparent",
                    opacity: cell.inWafer ? 1 : 0.05,
                    border: cell.inWafer ? undefined : 'none',
                    pointerEvents: cell.inWafer ? undefined : 'none'
                  }}
                  title={cell.inWafer ? `Position: (${x},${y}), Status: ${cell.status} - ${cell.status === "01" ? "Pass" : cell.status === "EF" ? "Defect" : cell.status === "FA" ? "Reference" : cell.status === "FF" ? "Null" : cell.status === "FC" ? "Fail Code" : "Unknown"}` : ''}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="bin-stats">
        <h3>Bin Statistics</h3>
        <table>
          <thead>
            <tr>
              <th>Bin Code</th>
              <th>Description</th>
              <th>Count</th>
              <th>Percentage</th>
            </tr>
          </thead>
          <tbody>
            {Array.from(binCounts.entries()).map(([code, count]) => (
              <tr key={code}>
                <td>{code}</td>
                <td>
                  {code === "01" ? "Pass Die" :
                   code === "EF" ? "Defect" :
                   code === "FA" ? "Reference Device" :
                   code === "FF" ? "Null" :
                   code === "FC" ? "Fail Code" : "Unknown"}
                </td>
                <td>{count}</td>
                <td>{((count / (rows * cols)) * 100).toFixed(2)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default WaferMapVisualization; 