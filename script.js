/* iphone-blur script.js
   - Draws double-layer: blurred background + sharp center
   - Records canvas stream and provides preview + save
*/
const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const recordBtn = document.getElementById('recordBtn');
const stopBtn = document.getElementById('stopBtn');
const downloadLink = document.getElementById('downloadLink');
const flipBtn = document.getElementById('flipBtn');

const previewWrap = document.getElementById('previewWrap');
const previewVideo = document.getElementById('preview');
const saveBtn = document.getElementById('saveBtn');
const closePreview = document.getElementById('closePreview');

let stream = null;
let recorder = null;
let recordedBlobs = [];
let usingFront = false;
let devices = [];
let currentTrack = null;

async function getDevices(){
  try{
    const list = await navigator.mediaDevices.enumerateDevices();
    devices = list.filter(d => d.kind === 'videoinput');
  }catch(e){ console.warn('No devices', e); }
}

async function startCamera(){
  await getDevices();
  const constraints = {
    video: { facingMode: usingFront ? 'user' : 'environment', width:{ideal:1280}, height:{ideal:720} },
    audio: true
  };
  try{
    stream = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = stream;
    currentTrack = stream.getVideoTracks()[0];
    // mirror video for front camera
    video.style.transform = usingFront ? 'scaleX(-1)' : 'scaleX(1)';
    await video.play();
    resizeCanvas();
    requestAnimationFrame(drawFrame);
  }catch(err){
    alert('Gagal akses kamera: ' + err.message);
  }
}

function stopCamera(){
  if(stream){
    stream.getTracks().forEach(t => t.stop());
    stream = null;
  }
}

function resizeCanvas(){
  const ratio = video.videoWidth / video.videoHeight || 16/9;
  canvas.width = video.videoWidth || 1280;
  canvas.height = video.videoHeight || 720;
  canvas.style.width = '100%';
  canvas.style.height = '100%';
}

function drawFrame(){
  if(!video || video.readyState < 2){ requestAnimationFrame(drawFrame); return; }
  // draw blurred background
  ctx.save();
  ctx.filter = 'blur(10px) brightness(1.04) contrast(1.02) saturate(1.05)';
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  ctx.restore();

  // draw vignette and color grade over blurred layer for cinematic look
  ctx.fillStyle = 'rgba(10,6,4,0.06)';
  ctx.fillRect(0,0,canvas.width,canvas.height);

  // draw sharp center area (rounded rect)
  const w = canvas.width * 0.6;
  const h = canvas.height * 0.6;
  const x = (canvas.width - w) / 2;
  const y = (canvas.height - h) / 2;
  ctx.save();
  // create clipping rounded rectangle
  roundRectPath(ctx, x, y, w, h, 40);
  ctx.clip();
  // draw sharp (no filter) video in center
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  ctx.restore();

  // soft edge: draw gradient mask to smooth transition
  const grad = ctx.createRadialGradient(canvas.width/2, canvas.height/2, Math.min(w,h)/3, canvas.width/2, canvas.height/2, Math.max(w,h)/1.1);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(0,0,0,0.35)');
  ctx.fillStyle = grad;
  ctx.fillRect(0,0,canvas.width,canvas.height);

  // cinematic color grade (warm overlay)
  ctx.fillStyle = 'rgba(255,180,120,0.03)';
  ctx.fillRect(0,0,canvas.width,canvas.height);

  requestAnimationFrame(drawFrame);
}

function roundRectPath(ctx, x, y, w, h, r){
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

recordBtn.addEventListener('click', () => {
  if(recorder && recorder.state === 'recording'){
    recorder.stop();
    recordBtn.style.opacity = '1';
    recordBtn.style.transform = 'scale(1)';
    stopBtn.disabled = true;
  } else {
    startRecording();
    recordBtn.style.opacity = '0.8';
    recordBtn.style.transform = 'scale(0.95)';
    stopBtn.disabled = false;
  }
});

stopBtn.addEventListener('click', () => {
  if(recorder && recorder.state === 'recording') recorder.stop();
});

flipBtn.addEventListener('click', async () => {
  usingFront = !usingFront;
  stopCamera();
  await startCamera();
});

function startRecording(){
  recordedBlobs = [];
  const canvasStream = canvas.captureStream(30); // record canvas output (with effects)
  // mix audio (from camera) into recorded stream
  const combined = new MediaStream();
  // add canvas video tracks
  canvasStream.getVideoTracks().forEach(t => combined.addTrack(t));
  // add audio tracks from original stream if available
  if(stream && stream.getAudioTracks().length > 0){
    stream.getAudioTracks().forEach(t => combined.addTrack(t));
  }
  const options = { mimeType: 'video/webm;codecs=vp9' };
  try{
    recorder = new MediaRecorder(combined, options);
  }catch(e){
    // fallback mime
    recorder = new MediaRecorder(combined);
  }
  recorder.ondataavailable = e => { if(e.data && e.data.size) recordedBlobs.push(e.data); };
  recorder.onstop = () => {
    const blob = new Blob(recordedBlobs, {type: 'video/webm'});
    const url = URL.createObjectURL(blob);
    previewVideo.src = url;
    previewWrap.classList.remove('hidden');
    downloadLink.href = url;
    downloadLink.style.display = 'inline-block';
  };
  recorder.start(100);
}

saveBtn.addEventListener('click', () => {
  if(!previewVideo.src) return;
  const a = document.createElement('a');
  a.href = previewVideo.src;
  a.download = 'cinematic-blur.webm';
  document.body.appendChild(a);
  a.click();
  a.remove();
});

closePreview.addEventListener('click', () => {
  previewWrap.classList.add('hidden');
  previewVideo.pause();
  previewVideo.src = '';
});

// start on load
startCamera();
window.addEventListener('beforeunload', () => { stopCamera(); });
