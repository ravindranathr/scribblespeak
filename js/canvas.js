/*
 * Interactive Handwriting Canvas Engine
 * Captures pointer strokes, applies curve-smoothing calligraphy, manages undo/redo stack,
 * and compiles standard Ink coordinates for Handwriting Recognition API.
 */

class HandwritingCanvas {
  constructor(canvasElement, containerElement, onStrokeEndCallback) {
    this.canvas = canvasElement;
    this.container = containerElement;
    this.ctx = this.canvas.getContext('2d');
    this.onStrokeEnd = onStrokeEndCallback;
    
    // Canvas State
    this.strokes = [];       // Complete history of current strokes: [ { points: [{x, y, t}], color, width } ]
    this.redoStrokes = [];   // Buffer for Redo actions
    this.currentStroke = null; // Stroke currently being drawn
    
    // Configurations
    this.penColor = '#1e293b'; // Default slate ink
    this.penWidthBase = 4;
    this.paperType = 'slate-dark';
    
    // Internal Drawing Constants
    this.lastPointer = null;
    this.lastVelocity = 0;
    this.lastWidth = 4;
    
    // Initialize
    this.initEvents();
    this.resizeCanvas();
    
    // Listen for resize
    window.addEventListener('resize', () => this.resizeCanvas());
  }

  // Set Brush Options
  setPenColor(color) {
    this.penColor = color;
  }

  setPenWidth(width) {
    this.penWidthBase = width;
    this.lastWidth = width;
  }

  setPaperType(type) {
    this.paperType = type;
    this.container.className = `canvas-container ${type}`;
    // Re-draw after background change
    this.redraw();
  }

  // Adjust Canvas Resolution for High-DPI Screens (Retina displays)
  resizeCanvas() {
    const rect = this.container.getBoundingClientRect();
    
    // Get Device Pixel Ratio
    const dpr = window.devicePixelRatio || 1;
    
    // Set internal width based on size and DPR
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    
    // Scale Context to account for DPR
    this.ctx.scale(dpr, dpr);
    
    // Set CSS display dimensions
    this.canvas.style.width = `${rect.width}px`;
    this.canvas.style.height = `${rect.height}px`;
    
    this.redraw();
  }

  // Event Listeners Initialization
  initEvents() {
    // Pointer Events handle both Touch, Mouse, and Stylus
    this.canvas.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    this.canvas.addEventListener('pointermove', (e) => this.onPointerMove(e));
    this.canvas.addEventListener('pointerup', (e) => this.onPointerUp(e));
    this.canvas.addEventListener('pointercancel', (e) => this.onPointerUp(e));
  }

  // Drawing Events
  onPointerDown(e) {
    this.canvas.setPointerCapture(e.pointerId);
    this.redoStrokes = []; // Clear redo stack on new stroke
    
    const coord = this.getRelativeCoords(e);
    const time = Date.now();
    
    this.currentStroke = {
      points: [{ x: coord.x, y: coord.y, t: time }],
      color: this.penColor,
      widthBase: this.penWidthBase
    };
    
    this.lastPointer = { x: coord.x, y: coord.y, t: time };
    this.lastVelocity = 0;
    this.lastWidth = this.penWidthBase;
    
    // Draw initial dot
    this.ctx.beginPath();
    this.ctx.arc(coord.x, coord.y, this.penWidthBase / 2, 0, Math.PI * 2);
    this.ctx.fillStyle = this.penColor;
    this.ctx.fill();
  }

  onPointerMove(e) {
    if (!this.currentStroke) return;
    
    const coord = this.getRelativeCoords(e);
    const time = Date.now();
    const currentPoint = { x: coord.x, y: coord.y, t: time };
    
    // Add point to stroke
    this.currentStroke.points.push(currentPoint);
    
    // Calculate Calligraphy Effect (Velocity-sensitive stroke width)
    const dist = Math.hypot(currentPoint.x - this.lastPointer.x, currentPoint.y - this.lastPointer.y);
    const timeDiff = Math.max(1, time - this.lastPointer.t);
    const velocity = dist / timeDiff; // pixels per ms
    
    // Smooth velocity changes (simple moving average filter)
    const smoothedVelocity = (velocity + this.lastVelocity) / 2;
    
    // Inverse relationship: faster drawing = thinner lines (calligraphy)
    const targetWidth = Math.max(
      this.currentStroke.widthBase * 0.4, 
      Math.min(this.currentStroke.widthBase * 1.5, this.currentStroke.widthBase / (1 + smoothedVelocity * 0.8))
    );
    
    // Smooth width transitions
    const finalWidth = (targetWidth + this.lastWidth * 2) / 3;
    
    // Draw smooth segment using Quadratic Curves
    this.ctx.beginPath();
    this.ctx.strokeStyle = this.currentStroke.color;
    this.ctx.lineWidth = finalWidth;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
    
    // Connect coordinates with smooth curves instead of straight lines
    this.ctx.moveTo(this.lastPointer.x, this.lastPointer.y);
    
    // Midpoint creates smooth curve connection
    const midX = (this.lastPointer.x + currentPoint.x) / 2;
    const midY = (this.lastPointer.y + currentPoint.y) / 2;
    
    this.ctx.quadraticCurveTo(this.lastPointer.x, this.lastPointer.y, midX, midY);
    this.ctx.stroke();
    
    // Store variables for next point
    this.lastPointer = currentPoint;
    this.lastVelocity = velocity;
    this.lastWidth = finalWidth;
  }

  onPointerUp(e) {
    if (!this.currentStroke) return;
    
    try {
      this.canvas.releasePointerCapture(e.pointerId);
    } catch (err) {}
    
    // Store the completed stroke
    this.strokes.push(this.currentStroke);
    this.currentStroke = null;
    
    // Trigger auto-recognition callback
    if (this.onStrokeEnd) {
      this.onStrokeEnd();
    }
  }

  // Helper to extract canvas local coords accounting for scaling
  getRelativeCoords(e) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  }

  // Redraw Canvas from Strokes History
  redraw() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    
    if (this.strokes.length === 0) return;
    
    this.strokes.forEach(stroke => {
      if (stroke.points.length < 2) {
        // Draw standalone dot
        const p = stroke.points[0];
        this.ctx.beginPath();
        this.ctx.arc(p.x, p.y, stroke.widthBase / 2, 0, Math.PI * 2);
        this.ctx.fillStyle = stroke.color;
        this.ctx.fill();
        return;
      }
      
      this.ctx.beginPath();
      this.ctx.strokeStyle = stroke.color;
      this.ctx.lineWidth = stroke.widthBase;
      this.ctx.lineCap = 'round';
      this.ctx.lineJoin = 'round';
      
      this.ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
      
      let lastPt = stroke.points[0];
      
      for (let i = 1; i < stroke.points.length; i++) {
        const p = stroke.points[i];
        const midX = (lastPt.x + p.x) / 2;
        const midY = (lastPt.y + p.y) / 2;
        this.ctx.quadraticCurveTo(lastPt.x, lastPt.y, midX, midY);
        lastPt = p;
      }
      
      // Final connection line
      this.ctx.lineTo(lastPt.x, lastPt.y);
      this.ctx.stroke();
    });
  }

  // Undo Functionality
  undo() {
    if (this.strokes.length === 0) return false;
    const removed = this.strokes.pop();
    this.redoStrokes.push(removed);
    this.redraw();
    return true;
  }

  // Redo Functionality
  redo() {
    if (this.redoStrokes.length === 0) return false;
    const restored = this.redoStrokes.pop();
    this.strokes.push(restored);
    this.redraw();
    return true;
  }

  // Clear Canvas completely
  clear() {
    this.strokes = [];
    this.redoStrokes = [];
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  // Returns true if the canvas is empty
  isEmpty() {
    return this.strokes.length === 0;
  }

  // Export strokes into standard Google Input Tools "ink" array format
  // Format: [ [ [x1, x2, ...], [y1, y2, ...], [t1, t2, ...] ], [stroke2] ]
  getInkData() {
    return this.strokes.map(stroke => {
      const xs = [];
      const ys = [];
      const ts = [];
      
      // Get baseline start timestamp
      const startTime = stroke.points[0].t;
      
      stroke.points.forEach(p => {
        xs.push(Math.round(p.x));
        ys.push(Math.round(p.y));
        // Use relative time in milliseconds from stroke start
        ts.push(p.t - startTime);
      });
      
      return [xs, ys, ts];
    });
  }

  // Render high-contrast black/white image representation of canvas for Tesseract.js (Offline)
  getHighContrastImageDataUrl() {
    // Create a temporary offline canvas to process the image
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = this.canvas.width;
    tempCanvas.height = this.canvas.height;
    const tempCtx = tempCanvas.getContext('2d');
    
    // Draw solid white background
    tempCtx.fillStyle = '#ffffff';
    tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
    
    // Redraw all strokes in crisp solid black (ideal for OCR Engines)
    // Account for high-DPI scaling factors
    const dpr = window.devicePixelRatio || 1;
    tempCtx.scale(dpr, dpr);
    
    this.strokes.forEach(stroke => {
      if (stroke.points.length < 2) {
        const p = stroke.points[0];
        tempCtx.beginPath();
        tempCtx.arc(p.x, p.y, stroke.widthBase / 2, 0, Math.PI * 2);
        tempCtx.fillStyle = '#000000';
        tempCtx.fill();
        return;
      }
      
      tempCtx.beginPath();
      tempCtx.strokeStyle = '#000000';
      tempCtx.lineWidth = Math.max(3, stroke.widthBase); // ensure strong line thickness for OCR scans
      tempCtx.lineCap = 'round';
      tempCtx.lineJoin = 'round';
      
      tempCtx.moveTo(stroke.points[0].x, stroke.points[0].y);
      let lastPt = stroke.points[0];
      
      for (let i = 1; i < stroke.points.length; i++) {
        const p = stroke.points[i];
        const midX = (lastPt.x + p.x) / 2;
        const midY = (lastPt.y + p.y) / 2;
        tempCtx.quadraticCurveTo(lastPt.x, lastPt.y, midX, midY);
        lastPt = p;
      }
      tempCtx.lineTo(lastPt.x, lastPt.y);
      tempCtx.stroke();
    });
    
    return tempCanvas.toDataURL('image/png');
  }
}

// Export class globally
window.HandwritingCanvas = HandwritingCanvas;
