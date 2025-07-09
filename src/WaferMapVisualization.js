import React from 'react';
import './WaferMapVisualization.css';

function WaferMapVisualization({ mapData }) {
  if (!mapData || !mapData.header || !mapData.dies) {
    return (
      <div className="wafer-map-visualization">
        <div className="no-data">No wafer map data available</div>
      </div>
    );
  }

  const rows = parseInt(mapData.header.Rows);
  const cols = parseInt(mapData.header.Columns);

  // Bin color mapping
  const binColors = {
    "01": "#4CAF50", // Pass - Green
    "EF": "#F44336", // Defect - Red
    "FA": "#2196F3", // Reference - Blue
    "FF": "#E0E0E0", // Null - Gray
    "FC": "#FF9800", // Fail Code - Orange
  };

  // Count bins for statistics
  const binCounts = new Map();
  for (const [_, status] of mapData.dies) {
    binCounts.set(status, (binCounts.get(status) || 0) + 1);
  }

  // Create the wafer map grid
  const createWaferMap = () => {
    const grid = [];
    
    for (let y = 0; y < rows; y++) {
      const row = [];
      for (let x = 0; x < cols; x++) {
        const coord = `${x},${y}`;
        const status = mapData.dies.get(coord) || "FF";
        row.push({ x, y, status });
      }
      grid.push(row);
    }
    
    return grid;
  };

  const waferGrid = createWaferMap();

  return (
    <div className="wafer-map-visualization">
      <div className="wafer-header">
        <h3>Wafer Map Visualization</h3>
        <div className="wafer-info">
          <span>Grid: {rows} × {cols}</span>
          <span>Total Dies: {mapData.dies.size}</span>
        </div>
      </div>
      
      <div className="wafer-container">
        <div className="wafer-grid">
          {waferGrid.map((row, y) => (
            <div key={y} className="wafer-row">
              {row.map(({ x, y, status }) => (
                <div
                  key={`${x}-${y}`}
                  className="wafer-cell"
                  style={{ 
                    backgroundColor: binColors[status] || "#9E9E9E",
                    width: '8px',
                    height: '8px'
                  }}
                  title={`(${x},${y}) - ${status}`}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="wafer-legend">
        <div className="legend-item">
          <div className="legend-color" style={{ backgroundColor: binColors["01"] }}></div>
          <span>Pass (01)</span>
        </div>
        <div className="legend-item">
          <div className="legend-color" style={{ backgroundColor: binColors["EF"] }}></div>
          <span>Defect (EF)</span>
        </div>
        <div className="legend-item">
          <div className="legend-color" style={{ backgroundColor: binColors["FA"] }}></div>
          <span>Reference (FA)</span>
        </div>
        <div className="legend-item">
          <div className="legend-color" style={{ backgroundColor: binColors["FF"] }}></div>
          <span>Null (FF)</span>
        </div>
        <div className="legend-item">
          <div className="legend-color" style={{ backgroundColor: binColors["FC"] }}></div>
          <span>Fail Code (FC)</span>
        </div>
      </div>

      <div className="wafer-stats">
        <h4>Die Statistics</h4>
        <div className="stats-grid">
          {Array.from(binCounts.entries()).map(([code, count]) => (
            <div key={code} className="stat-item">
              <div className="stat-color" style={{ backgroundColor: binColors[code] || "#9E9E9E" }}></div>
              <div className="stat-info">
                <div className="stat-code">{code}</div>
                <div className="stat-count">{count} dies</div>
                <div className="stat-percent">{((count / (rows * cols)) * 100).toFixed(1)}%</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default WaferMapVisualization; 