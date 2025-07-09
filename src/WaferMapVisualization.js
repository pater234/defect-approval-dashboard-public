import React from 'react';
import './WaferMapVisualization.css';

function WaferMapVisualization({ mapData }) {
  if (!mapData) return null;

  const rows = parseInt(mapData.header.Rows);
  const cols = parseInt(mapData.header.Columns);
  const binCounts = new Map();

  console.log('WaferMapVisualization render:', { rows, cols, mapData });

  // Count bins
  for (const [_, status] of mapData.dies) {
    binCounts.set(status, (binCounts.get(status) || 0) + 1);
  }

  // Create grid for visualization
  const grid = [];
  for (let y = 0; y < rows; y++) {
    const row = [];
    for (let x = 0; x < cols; x++) {
      const coord = `${x},${y}`;
      const status = mapData.dies.get(coord) || "FF";
      row.push(status);
    }
    grid.push(row);
  }
  
  console.log('Grid created:', { rows, cols, gridLength: grid.length, firstRowLength: grid[0]?.length });

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
        {grid.length > 0 ? (
          <div className="grid">
            {grid.map((row, y) => (
              <div key={y} className="row">
                {row.map((status, x) => (
                  <div
                    key={`${x}-${y}`}
                    className="cell"
                    style={{ backgroundColor: binColors[status] || "#9E9E9E" }}
                    title={`Position: (${x},${y}), Status: ${status} - ${status === "01" ? "Pass" : status === "EF" ? "Defect" : status === "FA" ? "Reference" : status === "FF" ? "Null" : status === "FC" ? "Fail Code" : "Unknown"}`}
                  />
                ))}
              </div>
            ))}
          </div>
        ) : (
          <div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>
            <p>No grid data available for visualization</p>
            <p>Rows: {rows}, Columns: {cols}</p>
          </div>
        )}
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