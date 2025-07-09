// G85 file format parser and merger
export function parseG85(content) {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(content, "text/xml");
  
  const mapData = {
    header: {},
    dies: new Map(), // Map of coordinates to die status
    defects: new Map(), // Map of coordinates to defect information
    bins: [], // Array of bin definitions
    referenceDevice: null, // Reference device information
    mapAttributes: {}, // Map-level attributes
  };

  // Parse Map-level attributes
  const mapElement = xmlDoc.documentElement;
  mapData.mapAttributes = {
    SubstrateNumber: mapElement.getAttribute("SubstrateNumber"),
    SubstrateType: mapElement.getAttribute("SubstrateType"),
    SubstrateId: mapElement.getAttribute("SubstrateId"),
    FormatRevision: mapElement.getAttribute("FormatRevision")
  };

  // Parse header information
  const device = xmlDoc.getElementsByTagName("Device")[0];
  if (device) {
    mapData.header = {
      BinType: device.getAttribute("BinType"),
      SupplierName: device.getAttribute("SupplierName"),
      LotId: device.getAttribute("LotId"),
      DeviceSizeX: device.getAttribute("DeviceSizeX"),
      DeviceSizeY: device.getAttribute("DeviceSizeY"),
      NullBin: device.getAttribute("NullBin"),
      ProductId: device.getAttribute("ProductId"),
      Rows: device.getAttribute("Rows"),
      Columns: device.getAttribute("Columns"),
      MapType: device.getAttribute("MapType"),
      OriginLocation: device.getAttribute("OriginLocation"),
      Orientation: device.getAttribute("Orientation"),
      WaferSize: device.getAttribute("WaferSize"),
      CreateDate: device.getAttribute("CreateDate"),
      LastModified: device.getAttribute("LastModified")
    };
  }

  // Parse reference device information
  const refDevice = xmlDoc.getElementsByTagName("ReferenceDevice")[0];
  if (refDevice) {
    mapData.referenceDevice = {
      ReferenceDeviceX: refDevice.getAttribute("ReferenceDeviceX"),
      ReferenceDeviceY: refDevice.getAttribute("ReferenceDeviceY")
    };
  }

  // Parse bin definitions
  const bins = xmlDoc.getElementsByTagName("Bin");
  for (let i = 0; i < bins.length; i++) {
    const bin = bins[i];
    mapData.bins.push({
      BinCode: bin.getAttribute("BinCode"),
      BinQuality: bin.getAttribute("BinQuality"),
      BinDescription: bin.getAttribute("BinDescription"),
      BinCount: bin.getAttribute("BinCount")
    });
  }

  // Parse die information from CDATA sections
  const rows = xmlDoc.getElementsByTagName("Row");
  for (let y = 0; y < rows.length; y++) {
    const rowContent = rows[y].textContent;
    for (let x = 0; x < rowContent.length; x += 2) {
      const binCode = rowContent.substring(x, x + 2);
      const coord = `${x/2},${y}`;
      mapData.dies.set(coord, binCode);
      
      // Store defects and reference dies
      if (binCode === "EF") {
        mapData.defects.set(coord, {
          type: "EF",
          additionalInfo: "Defect"
        });
      } else if (binCode === "FA") {
        mapData.defects.set(coord, {
          type: "FA",
          additionalInfo: "Reference Device"
        });
      }
    }
  }

  return mapData;
}

function findBottomRowCenter(mapData) {
  const rows = parseInt(mapData.header.Rows);
  const cols = parseInt(mapData.header.Columns);
  
  // Find the bottom-most row with viable devices
  let bottomRow = -1;
  let viableDies = [];
  
  for (let y = rows - 1; y >= 0; y--) {
    const rowDies = [];
    for (let x = 0; x < cols; x++) {
      const coord = `${x},${y}`;
      const status = mapData.dies.get(coord);
      if (status && status !== "FF" && status !== "FC") { // Not null or test die
        rowDies.push({ x, y, status });
      }
    }
    if (rowDies.length > 0) {
      bottomRow = y;
      viableDies = rowDies;
      break;
    }
  }
  
  if (bottomRow === -1 || viableDies.length === 0) {
    return null;
  }
  
  // Calculate center of viable dies in the bottom row
  const sumX = viableDies.reduce((sum, die) => sum + die.x, 0);
  const centerX = Math.round(sumX / viableDies.length);
  
  return { x: centerX, y: bottomRow };
}

function applyOffset(mapData, offsetX, offsetY) {
  const offsetMap = {
    header: { ...mapData.header },
    dies: new Map(),
    defects: new Map(),
    bins: [...mapData.bins], // Preserve bin definitions
    referenceDevice: mapData.referenceDevice ? { ...mapData.referenceDevice } : null, // Preserve reference device
    mapAttributes: { ...mapData.mapAttributes }, // Preserve map attributes
  };
  
  for (const [coord, status] of mapData.dies) {
    const [x, y] = coord.split(',').map(Number);
    const newX = x + offsetX;
    const newY = y + offsetY;
    const newCoord = `${newX},${newY}`;
    
    offsetMap.dies.set(newCoord, status);
    if (status === "EF" || status === "FA") {
      offsetMap.defects.set(newCoord, mapData.defects.get(coord));
    }
  }
  
  return offsetMap;
}

function findReferenceDevices(mapData) {
  const referenceDevices = [];
  
  for (const [coord, status] of mapData.dies) {
    if (status === "FA") {
      const [x, y] = coord.split(',').map(Number);
      referenceDevices.push({ x, y });
    }
  }
  
  if (referenceDevices.length === 0) {
    return null;
  }
  
  // Calculate the average position of reference devices
  const sumX = referenceDevices.reduce((sum, device) => sum + device.x, 0);
  const sumY = referenceDevices.reduce((sum, device) => sum + device.y, 0);
  const avgX = Math.round(sumX / referenceDevices.length);
  const avgY = Math.round(sumY / referenceDevices.length);
  
  return { x: avgX, y: avgY };
}

// Helper function to validate merged data
function validateMergedData(mergedData) {
  const rows = parseInt(mergedData.header.Rows);
  const cols = parseInt(mergedData.header.Columns);
  const validDies = new Map();
  
  // Only keep dies that are within the valid grid bounds
  for (const [coord, status] of mergedData.dies) {
    const [x, y] = coord.split(',').map(Number);
    if (x >= 0 && x < cols && y >= 0 && y < rows) {
      validDies.set(coord, status);
    }
  }
  
  console.log('Validation: Original dies:', mergedData.dies.size, 'Valid dies:', validDies.size);
  
  return {
    ...mergedData,
    dies: validDies
  };
}

export function mergeMapData(firstMap, secondMap) {
  // Find reference device centers
  const firstRefCenter = findReferenceDevices(firstMap);
  const secondRefCenter = findReferenceDevices(secondMap);
  
  let offsetX, offsetY;
  
  if (firstRefCenter && secondRefCenter) {
    // Use reference devices for alignment
    offsetX = firstRefCenter.x - secondRefCenter.x;
    offsetY = firstRefCenter.y - secondRefCenter.y;
  } else {
    // Fallback to bottom row center if no reference devices found
    const firstCenter = findBottomRowCenter(firstMap);
    const secondCenter = findBottomRowCenter(secondMap);
    
    if (!firstCenter || !secondCenter) {
      throw new Error("Could not find reference devices or viable dies in bottom row of one or both maps");
    }
    
    offsetX = firstCenter.x - secondCenter.x;
    offsetY = firstCenter.y - secondCenter.y;
  }
  
  // Apply offset to second map
  const offsetSecondMap = applyOffset(secondMap, offsetX, offsetY);
  
  const mergedData = {
    header: { ...firstMap.header },
    dies: new Map(),
    defects: new Map(),
    bins: [...firstMap.bins], // Preserve bin definitions from first map
    referenceDevice: firstMap.referenceDevice ? { ...firstMap.referenceDevice } : null, // Preserve reference device from first map
    mapAttributes: { ...firstMap.mapAttributes }, // Preserve map attributes from first map
  };

  // First, copy all dies from the first map
  for (const [coord, status] of firstMap.dies) {
    mergedData.dies.set(coord, status);
    if (status === "EF" || status === "FA") {
      mergedData.defects.set(coord, firstMap.defects.get(coord));
    }
  }

  // Then merge with offset second map
  for (const [coord, status] of offsetSecondMap.dies) {
    const firstMapStatus = firstMap.dies.get(coord);
    
    // If die exists in first map
    if (firstMapStatus) {
      // If first map has null die or test die, use second map's status
      if (firstMapStatus === "FF" || firstMapStatus === "FC") {
        mergedData.dies.set(coord, status);
        if (status === "EF" || status === "FA") {
          mergedData.defects.set(coord, offsetSecondMap.defects.get(coord));
        }
      }
      // If first map has defect, keep it
      else if (firstMapStatus === "EF") {
        // Keep first map's defect
        continue;
      }
      // If first map has reference die, keep it
      else if (firstMapStatus === "FA") {
        // Keep first map's reference
        continue;
      }
      // For all other cases (like pass dies), keep first map's status
      else {
        // Keep first map's status
        continue;
      }
    } else {
      // If die doesn't exist in first map, add it from second map
      mergedData.dies.set(coord, status);
      if (status === "EF" || status === "FA") {
        mergedData.defects.set(coord, offsetSecondMap.defects.get(coord));
      }
    }
  }

  // Add any additional defects from second map that might have been missed
  for (const [coord, defectInfo] of offsetSecondMap.defects) {
    const status = offsetSecondMap.dies.get(coord);
    if (status === "EF" && !mergedData.defects.has(coord)) {
      mergedData.dies.set(coord, status);
      mergedData.defects.set(coord, defectInfo);
    }
  }

  // Validate the merged data before returning
  return validateMergedData(mergedData);
}

export function generateG85(mergedData) {
  // Manually construct XML in the exact format of map1.g85
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  
  // Map element
  xml += `<Map xmlns="http://www.semi.org" SubstrateNumber="${mergedData.mapAttributes.SubstrateNumber || '?'}" SubstrateType="${mergedData.mapAttributes.SubstrateType || 'Wafer'}" SubstrateId="${mergedData.mapAttributes.SubstrateId || '25'}" FormatRevision="${mergedData.mapAttributes.FormatRevision || 'SEMI G85-0703'}">\n`;
  
  // Device element
  xml += '  <Device';
  for (const [key, value] of Object.entries(mergedData.header)) {
    xml += ` ${key}="${value}"`;
  }
  xml += '>\n';
  
  // Reference device
  if (mergedData.referenceDevice) {
    xml += `    <ReferenceDevice ReferenceDeviceX="${mergedData.referenceDevice.ReferenceDeviceX}" ReferenceDeviceY="${mergedData.referenceDevice.ReferenceDeviceY}" />\n`;
  }
  
  // Bin definitions
  for (const bin of mergedData.bins) {
    let binLine = `    <Bin BinCode="${bin.BinCode}" BinQuality="${bin.BinQuality}" BinDescription="${bin.BinDescription}"`;
    if (bin.BinCount) {
      binLine += ` BinCount="${bin.BinCount}"`;
    }
    binLine += ' />\n';
    xml += binLine;
  }
  
  // Ensure EF bin is included with proper count from merged data
  const efCount = Array.from(mergedData.dies.values()).filter(status => status === "EF").length;
  if (efCount > 0) {
    xml += `    <Bin BinCode="EF" BinQuality="Fail" BinDescription="Fail Die" BinCount="${efCount}" />\n`;
  }
  
  // Ensure FC bin is included with proper count from merged data
  const fcCount = Array.from(mergedData.dies.values()).filter(status => status === "FC").length;
  if (fcCount > 0) {
    xml += `    <Bin BinCode="FC" BinQuality="Fail" BinDescription="Fail Code" BinCount="${fcCount}" />\n`;
  }
  
  // Data element
  xml += '    <Data MapName="%%mapname%%" MapVersion="%%mapversion%%">\n';
  
  // Generate rows
  const rows = parseInt(mergedData.header.Rows);
  const cols = parseInt(mergedData.header.Columns);
  
  for (let y = 0; y < rows; y++) {
    let rowContent = "";
    for (let x = 0; x < cols; x++) {
      const coord = `${x},${y}`;
      const status = mergedData.dies.get(coord) || "FF";
      rowContent += status;
    }
    xml += `      <Row><![CDATA[${rowContent}]]></Row>\n`;
  }
  
  // Close tags
  xml += '    </Data>\n';
  xml += '  </Device>\n';
  xml += '</Map>';
  
  // Test that the generated XML can be parsed correctly
  try {
    const testParse = parseG85(xml);
    console.log('Generated XML test parse successful:', {
      rows: testParse.header.Rows,
      cols: testParse.header.Columns,
      dieCount: testParse.dies.size
    });
  } catch (error) {
    console.error('Generated XML test parse failed:', error);
  }
  
  return xml;
}

// Helper function to find test die areas (rectangular regions of null die or fail codes)
function findTestDieAreas(mapData) {
  const rows = parseInt(mapData.header.Rows);
  const cols = parseInt(mapData.header.Columns);
  const testAreas = [];
  
  // Look for rectangular regions of null dies or fail codes
  for (let startY = 0; startY < rows; startY++) {
    for (let startX = 0; startX < cols; startX++) {
      // Check if this is the start of a test die area (null die or fail code)
      const startCoord = `${startX},${startY}`;
      const startStatus = mapData.dies.get(startCoord);
      if (startStatus === "FF" || startStatus === "FC") {
        // Find the extent of this rectangular test region
        let width = 0;
        let height = 0;
        
        // Find width (how many consecutive test dies in this row)
        for (let x = startX; x < cols; x++) {
          const coord = `${x},${startY}`;
          const status = mapData.dies.get(coord);
          if (status === "FF" || status === "FC") {
            width++;
          } else {
            break;
          }
        }
        
        // Find height (how many consecutive rows have test dies in this column range)
        for (let y = startY; y < rows; y++) {
          let rowHasTestDies = true;
          for (let x = startX; x < startX + width; x++) {
            const coord = `${x},${y}`;
            const status = mapData.dies.get(coord);
            if (status !== "FF" && status !== "FC") {
              rowHasTestDies = false;
              break;
            }
          }
          if (rowHasTestDies) {
            height++;
          } else {
            break;
          }
        }
        
        // Check if this is a valid test die area (surrounded by pass dies)
        if (width >= 1 && height >= 1) {
          let isSurroundedByPass = true;
          
          // Check top border
          if (startY > 0) {
            for (let x = startX; x < startX + width; x++) {
              const coord = `${x},${startY - 1}`;
              if (mapData.dies.get(coord) !== "01") {
                isSurroundedByPass = false;
                break;
              }
            }
          }
          
          // Check bottom border
          if (startY + height < rows && isSurroundedByPass) {
            for (let x = startX; x < startX + width; x++) {
              const coord = `${x},${startY + height}`;
              if (mapData.dies.get(coord) !== "01") {
                isSurroundedByPass = false;
                break;
              }
            }
          }
          
          // Check left border
          if (startX > 0 && isSurroundedByPass) {
            for (let y = startY; y < startY + height; y++) {
              const coord = `${startX - 1},${y}`;
              if (mapData.dies.get(coord) !== "01") {
                isSurroundedByPass = false;
                break;
              }
            }
          }
          
          // Check right border
          if (startX + width < cols && isSurroundedByPass) {
            for (let y = startY; y < startY + height; y++) {
              const coord = `${startX + width},${y}`;
              if (mapData.dies.get(coord) !== "01") {
                isSurroundedByPass = false;
                break;
              }
            }
          }
          
          if (isSurroundedByPass) {
            testAreas.push({
              x: startX,
              y: startY,
              width: width,
              height: height,
              centerX: startX + Math.floor(width / 2),
              centerY: startY + Math.floor(height / 2)
            });
            
            console.log('Found test die area:', {
              x: startX, y: startY, width, height,
              centerX: startX + Math.floor(width / 2),
              centerY: startY + Math.floor(height / 2)
            });
          }
        }
      }
    }
  }
  
  return testAreas;
}

// Helper function to find the lowest test die area
function findLowestTestDieArea(testAreas) {
  if (testAreas.length === 0) return null;
  
  // Find the test die area with the highest Y coordinate (lowest on the wafer)
  let lowestArea = testAreas[0];
  for (const area of testAreas) {
    if (area.centerY > lowestArea.centerY) {
      lowestArea = area;
    }
  }
  
  return lowestArea;
}

// Function to merge scan map with control map
export function mergeWithControlMap(controlMap, scanMap, uploadingToServer = false) {
  // Get dimensions of both maps
  const controlRows = parseInt(controlMap.header.Rows);
  const controlCols = parseInt(controlMap.header.Columns);
  const scanRows = parseInt(scanMap.header.Rows);
  const scanCols = parseInt(scanMap.header.Columns);
  
  console.log('Control map dimensions:', controlRows, 'x', controlCols);
  console.log('Scan map dimensions:', scanRows, 'x', scanCols);
  
  // Find test die areas in both maps
  const controlTestAreas = findTestDieAreas(controlMap);
  const scanTestAreas = findTestDieAreas(scanMap);
  
  console.log('Control test areas:', controlTestAreas.length);
  console.log('Scan test areas:', scanTestAreas.length);
  
  if (controlTestAreas.length === 0 || scanTestAreas.length === 0) {
    throw new Error('Could not find test die areas in one or both maps');
  }
  
  // Find the lowest test die areas
  const controlLowest = findLowestTestDieArea(controlTestAreas);
  const scanLowest = findLowestTestDieArea(scanTestAreas);
  
  console.log('Control lowest test area:', controlLowest);
  console.log('Scan lowest test area:', scanLowest);
  
  // Calculate offset to align the lowest test areas using their centers
  const offsetX = controlLowest.centerX - scanLowest.centerX;
  const offsetY = controlLowest.centerY - scanLowest.centerY;
  
  console.log('Alignment offset:', { offsetX, offsetY });
  
  // Create the merged data using control map as base
  const mergedData = {
    header: { ...scanMap.header }, // Use scan map header as base
    dies: new Map(),
    defects: new Map(),
    bins: [...controlMap.bins], // Use control map's bin definitions
    referenceDevice: controlMap.referenceDevice ? { ...controlMap.referenceDevice } : null, // Use control map's reference device
    mapAttributes: { ...scanMap.mapAttributes }, // Use scan map's map attributes
  };
  
  // Override specific fields from control map
  mergedData.header.Rows = controlMap.header.Rows;
  mergedData.header.Columns = controlMap.header.Columns;
  // Remove ReferenceDeviceX and ReferenceDeviceY from header (they should only be in ReferenceDevice element)
  delete mergedData.header.ReferenceDeviceX;
  delete mergedData.header.ReferenceDeviceY;
  // Use ProductId from scan map only
  mergedData.header.ProductId = scanMap.header.ProductId;
  
  // Modify lot ID and substrate ID if uploading to server
  if (uploadingToServer) {
    // Modify lot ID: add Z before the period if there is one, otherwise attach Z to the end
    const lotId = mergedData.header.LotId;
    if (lotId) {
      const periodIndex = lotId.indexOf('.');
      if (periodIndex !== -1) {
        mergedData.header.LotId = lotId.substring(0, periodIndex) + 'Z' + lotId.substring(periodIndex);
      } else {
        mergedData.header.LotId = lotId + 'Z';
      }
    }
    
    // Modify substrate ID: add Z to the end
    const substrateNumber = mergedData.mapAttributes.SubstrateNumber;
    if (substrateNumber) {
      mergedData.mapAttributes.SubstrateNumber = substrateNumber + 'Z';
    }
  }
  
  // First, copy all dies from the control map
  for (const [coord, status] of controlMap.dies) {
    mergedData.dies.set(coord, status);
    if (status === "EF" || status === "FA") {
      mergedData.defects.set(coord, controlMap.defects.get(coord));
    }
  }
  
  // Then overlay defects from the scan map
  for (const [coord, status] of scanMap.dies) {
    if (status === "EF") { // Only process defects
      const [x, y] = coord.split(',').map(Number);
      const alignedX = x + offsetX;
      const alignedY = y + offsetY;
      const alignedCoord = `${alignedX},${alignedY}`;
      
      // Check if the aligned coordinate is within control map bounds
      if (alignedX >= 0 && alignedX < controlCols && alignedY >= 0 && alignedY < controlRows) {
        const controlStatus = controlMap.dies.get(alignedCoord);
        
        // Only mark as defect if the control map has a valid die at this location (not null or test die)
        if (controlStatus && controlStatus !== "FF" && controlStatus !== "FC") {
          mergedData.dies.set(alignedCoord, "EF");
          mergedData.defects.set(alignedCoord, {
            type: "EF",
            additionalInfo: "Defect from scan map"
          });
        }
      }
    }
  }
  
  console.log('Merged data die count:', mergedData.dies.size);
  
  return mergedData;
} 

// Function to merge multiple maps in sequence
export function mergeMultipleMaps(maps, uploadingToServer = false, firstMapIsControl = false) {
  if (maps.length < 2) {
    throw new Error('At least 2 maps are required for merging');
  }

  console.log(`Merging ${maps.length} maps in sequence`);

  // Start with the first map as the base
  let mergedData = {
    header: { ...maps[0].header },
    dies: new Map(),
    defects: new Map(),
    bins: [...maps[0].bins],
    referenceDevice: maps[0].referenceDevice ? { ...maps[0].referenceDevice } : null,
    mapAttributes: { ...maps[0].mapAttributes },
  };

  // If first map is control map, extract metadata from second map
  if (firstMapIsControl && maps.length >= 2) {
    // Use ProductId from second map
    mergedData.header.ProductId = maps[1].header.ProductId;
    // Use LotId from second map
    mergedData.header.LotId = maps[1].header.LotId;
    // Use map attributes from second map
    mergedData.mapAttributes = { ...maps[1].mapAttributes };
  }

  // Copy all dies from the first map
  for (const [coord, status] of maps[0].dies) {
    mergedData.dies.set(coord, status);
    if (status === "EF" || status === "FA") {
      mergedData.defects.set(coord, maps[0].defects.get(coord));
    }
  }

  // Merge each subsequent map
  for (let i = 1; i < maps.length; i++) {
    const currentMap = maps[i];
    console.log(`Merging map ${i + 1}/${maps.length}`);

    // Find test die areas for alignment
    const baseTestAreas = findTestDieAreas(mergedData);
    const currentTestAreas = findTestDieAreas(currentMap);

    if (baseTestAreas.length === 0 || currentTestAreas.length === 0) {
      throw new Error(`Could not find test die areas in map ${i + 1}`);
    }

    // Find the lowest test die areas for alignment
    const baseLowest = findLowestTestDieArea(baseTestAreas);
    const currentLowest = findLowestTestDieArea(currentTestAreas);

    // Calculate offset to align the lowest test areas
    const offsetX = baseLowest.centerX - currentLowest.centerX;
    const offsetY = baseLowest.centerY - currentLowest.centerY;

    console.log(`Alignment offset for map ${i + 1}:`, { offsetX, offsetY });

    // Get dimensions of the base merged data
    const baseRows = parseInt(mergedData.header.Rows);
    const baseCols = parseInt(mergedData.header.Columns);

    // Overlay defects from the current map
    for (const [coord, status] of currentMap.dies) {
      if (status === "EF") { // Only process defects
        const [x, y] = coord.split(',').map(Number);
        const alignedX = x + offsetX;
        const alignedY = y + offsetY;
        const alignedCoord = `${alignedX},${alignedY}`;

        // Check if the aligned coordinate is within base map bounds
        if (alignedX >= 0 && alignedX < baseCols && alignedY >= 0 && alignedY < baseRows) {
          const baseStatus = mergedData.dies.get(alignedCoord);

          // Only mark as defect if the base map has a valid die at this location (not null or test die)
          if (baseStatus && baseStatus !== "FF" && baseStatus !== "FC") {
            mergedData.dies.set(alignedCoord, "EF");
            mergedData.defects.set(alignedCoord, {
              type: "EF",
              additionalInfo: `Defect from map ${i + 1}`
            });
          }
        }
      }
    }
  }

  // Modify lot ID and substrate ID if uploading to server
  if (uploadingToServer) {
    // Modify lot ID: add Z before the period if there is one, otherwise attach Z to the end
    const lotId = mergedData.header.LotId;
    if (lotId) {
      const periodIndex = lotId.indexOf('.');
      if (periodIndex !== -1) {
        mergedData.header.LotId = lotId.substring(0, periodIndex) + 'Z' + lotId.substring(periodIndex);
      } else {
        mergedData.header.LotId = lotId + 'Z';
      }
    }

    // Modify substrate ID: add Z to the end
    const substrateNumber = mergedData.mapAttributes.SubstrateNumber;
    if (substrateNumber) {
      mergedData.mapAttributes.SubstrateNumber = substrateNumber + 'Z';
    }
  }

  console.log('Multi-map merge complete. Total die count:', mergedData.dies.size);
  return mergedData;
} 