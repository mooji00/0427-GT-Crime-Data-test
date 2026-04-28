let canvasScale = 0.3;
let mapImg, crimeData;
let video, poseNet;

let trackers = [
  { x: 0, y: 0, active: false, lastSeen: 0, angle: 0 },
  { x: 0, y: 0, active: false, lastSeen: 0, angle: 1.0 },
  { x: 0, y: 0, active: false, lastSeen: 0, angle: 2.0 }
];
let sensitivity = 0.02; 

// UI
let incidents = [];
let leftSlot = null;      
let rightSlotTop = null;  
let rightSlotBot = null;  
let lastUpdates = [0, 0, 0];
let displayInterval = 6000;

function preload() {
  mapImg = loadImage('map3.png'); 
  crimeData = loadTable('gt_police_final_log_with_location.csv', 'csv', 'header');
}

function setup() {
  createCanvas(3072 * canvasScale, 1280 * canvasScale);
  video = createCapture(VIDEO);
  video.size(640, 480);
  video.hide();

  poseNet = ml5.poseNet(video, () => console.log("System Online - Non-Mirrored Mode"));
  
  poseNet.on('pose', (results) => {
    let processedThisFrame = [false, false, false];
    for (let res of results) {
      
      let tx = map(res.pose.nose.x, 0, 640, 0, width);
      let ty = map(res.pose.nose.y, 0, 480, 0, height);
      
      let closestIdx = -1;
      let minDist = 200; 
      for (let i = 0; i < trackers.length; i++) {
        let d = dist(tx, ty, trackers[i].x, trackers[i].y);
        if (d < minDist) { minDist = d; closestIdx = i; }
      }
      
      let targetIdx = (closestIdx === -1) ? trackers.findIndex(t => !t.active) : closestIdx;
      if (targetIdx !== -1 && !processedThisFrame[targetIdx]) {
        if (!trackers[targetIdx].active) {
          trackers[targetIdx].x = tx; trackers[targetIdx].y = ty;
        } else {
          trackers[targetIdx].x = lerp(trackers[targetIdx].x, tx, sensitivity);
          trackers[targetIdx].y = lerp(trackers[targetIdx].y, ty, sensitivity);
        }
        trackers[targetIdx].active = true;
        trackers[targetIdx].lastSeen = millis();
        processedThisFrame[targetIdx] = true;
      }
    }
    for (let t of trackers) { if (millis() - t.lastSeen > 5000) t.active = false; }
  });
  processData();
}

function draw() {
  background(0); 
  
  //video
  push();
  tint(100, 130, 160, 10); 
  image(video, 0, 0, width, height);
  pop();

  //map
  push();
  tint(255, 45); 
  image(mapImg, 0, 0, width, height);
  pop();

  //radar
  if (trackers.some(t => t.active)) {
    for (let t of trackers) { if (t.active) runRadar(t); }
  } else {
    drawIdleState();
    leftSlot = null; rightSlotTop = null; rightSlotBot = null;
  }
  
  renderUI();
  drawHUDDecor();
}

function processData() {
  if (!crimeData) return;
  for (let i = 0; i < crimeData.getRowCount(); i++) {
    let row = crimeData.getRow(i);
    let disp = (row.getString(2) || "").toLowerCase();
    let isRes = disp.includes("closed") || disp.includes("arrest") || disp.includes("unfounded");
    incidents.push({
      nature: row.getString(0), time: row.getString(1), loc: row.getString(3),
      x: random(width*0.1, width*0.9), y: random(height*0.1, height*0.9),
      isResolved: isRes, scanned: false
    });
  }
}

function runRadar(t) {
  t.angle += 0.005; 
  let rMax = 180 * canvasScale;
  push();
  translate(t.x, t.y);
  noFill(); stroke(0, 255, 220, 120); strokeWeight(2);
  ellipse(0, 0, rMax * 2);
  stroke(0, 255, 220, 40); drawingContext.setLineDash([5, 5]);
  ellipse(0, 0, rMax * 1.4); 
  drawingContext.setLineDash([]);
  let lx = cos(t.angle) * rMax;
  let ly = sin(t.angle) * rMax;
  stroke(0, 255, 220, 200); line(0, 0, lx, ly);
  noStroke();
  for (let i = 0; i < 15; i++) {
    fill(0, 255, 220, map(i, 0, 15, 0, 60));
    arc(0, 0, rMax*2, rMax*2, t.angle - 0.4 * (i/15), t.angle - 0.4 * ((i-1)/15));
  }
  pop();

  for (let pt of incidents) {
    let d = dist(t.x, t.y, pt.x, pt.y);
    if (d < rMax) {
      let ptA = atan2(pt.y - t.y, pt.x - t.x);
      if (ptA < 0) ptA += TWO_PI;
      if (abs((t.angle % TWO_PI) - ptA) < 0.06) {
        pt.scanned = true;
        updateUI(pt);
      }
    }
    drawPoint(pt);
  }
}

function drawPoint(pt) {
  let sz = 12 * canvasScale;
  if (!pt.scanned) {
    fill(255, 70); noStroke(); ellipse(pt.x, pt.y, sz);
  } else {
    let col = pt.isResolved ? color(0, 255, 180) : color(255, 60, 60);
    fill(col); ellipse(pt.x, pt.y, sz * 1.4);
    fill(red(col), green(col), blue(col), 35); ellipse(pt.x, pt.y, sz * 3.5);
  }
}

function updateUI(pt) {
  let now = millis();
  if (!pt.isResolved && now - lastUpdates[0] > displayInterval) {
    leftSlot = pt; lastUpdates[0] = now;
  } else if (pt.isResolved) {
    if (now - lastUpdates[1] > displayInterval) {
      rightSlotTop = pt; lastUpdates[1] = now;
    } else if (now - lastUpdates[2] > displayInterval + 1500) {
      rightSlotBot = pt; lastUpdates[2] = now;
    }
  }
}

function renderUI() {
  let margin = 70 * canvasScale;
  let w = 400 * canvasScale;
  let h = 240 * canvasScale;
  if (leftSlot) drawCard(leftSlot, margin, height/2 - h/2, "UNSOLVED", color(255, 60, 60));
  if (rightSlotTop) drawCard(rightSlotTop, width - w - margin, height/2 - h - 10, "RESOLVED", color(0, 255, 180));
  if (rightSlotBot) drawCard(rightSlotBot, width - w - margin, height/2 + 10, "RESOLVED", color(0, 255, 180));
}

function drawCard(pt, x, y, label, col) {
  let w = 400 * canvasScale;
  let h = 240 * canvasScale;
  let pad = 25 * canvasScale; 

  push();
  translate(x, y);
  rectMode(CORNER);
  fill(15, 205); stroke(col); strokeWeight(0.5);
  rect(0, 0, w, h, 5);
  
  textAlign(LEFT, TOP); noStroke(); 
  
  fill(col); textSize(14 * canvasScale); textStyle(BOLD);
  text(label, pad, pad);
  
  textSize(38 * canvasScale);
  text(pt.time, pad, h/2 - (35 * canvasScale)); 

  fill(255); textStyle(NORMAL);
  textSize(16 * canvasScale);
  textLeading(18 * canvasScale);
  text(pt.nature, pad, h/2 + (15 * canvasScale), w - (pad * 2));
  
  fill(160); 
  textSize(12 * canvasScale);

  text(`Loc: ${pt.loc}`, pad, h/2 + (55 * canvasScale), w - (pad * 2));
  
  pop();
}

function drawIdleState() {
  for (let pt of incidents) {
    let p = 60 + sin(frameCount * 0.05) * 40;
    fill(255, p); noStroke(); ellipse(pt.x, pt.y, 11 * canvasScale);
  }
}

function drawHUDDecor() {
  stroke(0, 255, 220, 150); strokeWeight(5);
  let s = 25 * canvasScale;
  line(0,0,s,0); line(0,0,0,s);
  line(width,0,width-s,0); line(width,0,width,s);
  line(0,height,s,height); line(0,height,0,height-s);
  line(width,height,width-s,height); line(width,height,width,height-s);
  
  textAlign(LEFT, BOTTOM); noStroke(); fill(255, 110); 
  textSize(25 * canvasScale);
  text("*Marked points don't reflect the actual location", 25 * canvasScale, height - 25 * canvasScale);
}