(() => {
'use strict';
const $ = id => document.getElementById(id);
const API = '/api';
const DEFAULT = {playerId:'',car:'audi',track:'city',paint:'#ff6a00',wheel:'sport',best:0,cash:125000,engine:0,nitroLevel:0,wins:0};
let state = {...DEFAULT};
try { state = {...DEFAULT,...JSON.parse(localStorage.getItem('nitroVelocity3D') || '{}')}; } catch (_) {}
let authToken = localStorage.getItem('nitroVelocity3D_token') || null;
let scene,camera,renderer,clock,player,roadGroup,traffic=[],police=[],roadPieces=[],scenery=[],keys={},running=false,paused=false;
let speed=0,nitro=100,heat=0,worldTime=0,lap=1,lapDistance=0,totalDistance=0,raceTime=0,heading=0,checkpoint=0;
const LAPS=3, TRACK_LEN=2400, ROAD_HALF=8.5;
const cfg={
 audi:{name:'Apex GT',w:2.0,h:1.05,l:4.5,max:235,acc:64,turn:1.05,price:0},
 range:{name:'Titan SUV',w:2.2,h:1.28,l:4.9,max:198,acc:52,turn:.88,price:35000},
 thar:{name:'Raptor X',w:2.0,h:1.32,l:4.1,max:182,acc:50,turn:1.0,price:55000}
};
const tracks={city:{name:'Neon City',sky:'#07111d',ground:'#101b18',road:'#20252b'},desert:{name:'Solar Desert',sky:'#24170e',ground:'#5b3b22',road:'#302923'},mountain:{name:'Summit Pass',sky:'#0a1118',ground:'#17231e',road:'#24282c'}};
const saveLocal=()=>localStorage.setItem('nitroVelocity3D',JSON.stringify(state));
async function apiCall(path,opts={}){const res=await fetch(API+path,{...opts,headers:{'Content-Type':'application/json',...(authToken?{Authorization:'Bearer '+authToken}:{}),...(opts.headers||{})}});const data=await res.json().catch(()=>({}));if(!res.ok){const e=new Error(data.error||'Request failed');e.status=res.status;throw e}return data}
async function authenticate(playerId,password){try{return await apiCall('/auth/login',{method:'POST',body:JSON.stringify({playerId,password})})}catch(e){if(e.status!==401)throw e;return await apiCall('/auth/register',{method:'POST',body:JSON.stringify({playerId,password})})}}
async function pullCloudSave(){if(!authToken)return;try{Object.assign(state,await apiCall('/save'));saveLocal()}catch(_){}}
async function pushCloudSave(){if(!authToken)return;try{await apiCall('/save',{method:'PUT',body:JSON.stringify({car:state.car,track:state.track,paint:state.paint,wheel:state.wheel,best:state.best,cash:state.cash,engine:state.engine,nitroLevel:state.nitroLevel,wins:state.wins})})}catch(_) {}}
function persist(){saveLocal();pushCloudSave();updateSaved()}
function updateSaved(){ $('saved').textContent=state.playerId?`Driver: ${state.playerId} · Wins: ${state.wins} · Cash: ₹${state.cash.toLocaleString()}${authToken?' · CLOUD SAVE ON':''}`:'Guest mode · progress saved on this device'; }
function show(id){['menu','garage','controls'].forEach(x=>$(x).classList.add('hidden'));$(id).classList.remove('hidden')}
function setMenuValues(){ $('playerId').value=state.playerId;$('carSelect').value=state.car;$('trackSelect').value=state.track;$('garageCar').value=state.car;$('paint').value=state.paint;$('wheel').value=state.wheel;updateGarage();updateSaved(); }
setMenuValues();
$('garageBtn').onclick=()=>show('garage');$('howBtn').onclick=()=>show('controls');document.querySelectorAll('[data-back]').forEach(b=>b.onclick=()=>show('menu'));
$('garageCar').onchange=()=>{state.car=$('garageCar').value;updateGarage()};$('paint').onchange=()=>{state.paint=$('paint').value;updateGarage()};$('wheel').onchange=()=>{state.wheel=$('wheel').value;updateGarage()};
function updateGarage(){const c=cfg[$('garageCar').value];$('garageCarArt').style.color=$('paint').value;$('garageCarArt').textContent=$('garageCar').value==='range'?'🚙':$('garageCar').value==='thar'?'🚘':'🏎️';$('garageStats').innerHTML=`<b>${c.name}</b><br>TOP SPEED ${Math.round(c.max+state.engine*12)} KM/H<br>ACCEL ${Math.round(c.acc+state.engine*7)}<br>ENGINE LEVEL ${state.engine}/5<br>NITRO LEVEL ${state.nitroLevel}/5`;const nextE=state.engine<5?`ENGINE +1 — ₹${15000*(state.engine+1).toLocaleString()}`:'ENGINE MAX';const nextN=state.nitroLevel<5?`NITRO +1 — ₹${12000*(state.nitroLevel+1).toLocaleString()}`:'NITRO MAX';$('engineUpgrade').textContent=nextE;$('nitroUpgrade').textContent=nextN;$('upgradeInfo').textContent=`Cash: ₹${state.cash.toLocaleString()} · Upgrades permanently improve your car.`}
$('engineUpgrade').onclick=()=>{if(state.engine>=5)return;if(state.cash<15000*(state.engine+1)){showMessage('NOT ENOUGH CASH');return}state.cash-=15000*(state.engine+1);state.engine++;persist();updateGarage()};
$('nitroUpgrade').onclick=()=>{if(state.nitroLevel>=5)return;if(state.cash<12000*(state.nitroLevel+1)){showMessage('NOT ENOUGH CASH');return}state.cash-=12000*(state.nitroLevel+1);state.nitroLevel++;persist();updateGarage()};
$('saveGarage').onclick=()=>{state.car=$('garageCar').value;state.paint=$('paint').value;state.wheel=$('wheel').value;persist();$('saved').textContent='Garage saved.';setTimeout(updateSaved,1200)};
$('saveBtn').onclick=()=>{persist();$('saved').textContent='Game data saved on this device.';setTimeout(updateSaved,1400)};
function material(c,rough=.8,metal=.1){return new THREE.MeshStandardMaterial({color:c,roughness:rough,metalness:metal})}
function box(g,size,c,x,y,z,rot=0){const m=new THREE.Mesh(new THREE.BoxGeometry(...size),material(c,.65,.18));m.position.set(x,y,z);m.rotation.y=rot;m.castShadow=true;g.add(m);return m}
function makeCar(type,color,isPolice=false){const c=cfg[type]||cfg.audi,g=new THREE.Group();
 const body=box(g,[c.w,c.h,c.l],color,0,.72,0);body.scale.set(1,1,1);const hood=box(g,[c.w*.92,.18,c.l*.38],color,0,1.2,.72);const cabin=box(g,[c.w*.78,c.h*.72,c.l*.48],isPolice?'#e9eef4':'#101923',0,1.36,-.22);cabin.castShadow=true;
 const glass=box(g,[c.w*.68,.34,c.l*.35],'#19334a',0,1.52,-.23);const bumper=box(g,[c.w*1.02,.18,.32],isPolice?'#dfe7ef':'#11151b',0,.55,-c.l/2-.03);
 for(const x of[-c.w*.57,c.w*.57])for(const z of[-c.l*.33,c.l*.33]){const w=new THREE.Mesh(new THREE.CylinderGeometry(.39,.39,.24,20),material(state.wheel==='offroad'?'#4b4b4b':'#111',.45,.55));w.rotation.z=Math.PI/2;w.position.set(x,.4,z);w.castShadow=true;g.add(w)}
 const head=material('#e9fbff',.18,.2);for(const x of[-c.w*.34,c.w*.34]){const l=new THREE.Mesh(new THREE.BoxGeometry(.28,.12,.12),head);l.position.set(x,.9,-c.l/2-.04);g.add(l)}
 const tail=material('#ff2b2b',.25,.1);for(const x of[-c.w*.34,c.w*.34]){const l=new THREE.Mesh(new THREE.BoxGeometry(.25,.1,.1),tail);l.position.set(x,.86,c.l/2+.04);g.add(l)}
 if(type==='audi'){box(g,[c.w*1.05,.08,.65],color,0,1.12,c.l*.42);box(g,[.1,.16,.7],'#090b0d',0,1.12,c.l*.43)}
 if(isPolice){box(g,[c.w*.68,.13,.5],'#182431',0,1.9,0);box(g,[.25,.15,.2],'#ff1e1e',-.28,2.0,0);box(g,[.25,.15,.2],'#2388ff',.28,2.0,0)}
 return g}
function curve(z){return Math.sin(z*.0048)*5.5+Math.sin(z*.00145)*3.2}
function curveSlope(z){return Math.cos(z*.0048)*.0264+Math.cos(z*.00145)*.00464}
function makeRoad(){roadGroup=new THREE.Group();scene.add(roadGroup);roadPieces=[];scenery=[];const t=tracks[state.track];
 const ground=new THREE.Mesh(new THREE.PlaneGeometry(180,TRACK_LEN+500),material(t.ground,1,0));ground.rotation.x=-Math.PI/2;ground.position.y=-.2;ground.position.z=0;ground.receiveShadow=true;roadGroup.add(ground);
 for(let z=-TRACK_LEN/2;z<=TRACK_LEN/2;z+=18){const center=curve(z),slope=curveSlope(z),angle=Math.atan(slope);const r=new THREE.Mesh(new THREE.BoxGeometry(ROAD_HALF*2,.24,20),material(t.road,1,0));r.position.set(center,0,z);r.rotation.y=-angle;r.receiveShadow=true;roadGroup.add(r);roadPieces.push(r);
  const edgeMat=material('#e7d79a',.6,0);for(const side of[-1,1]){const e=new THREE.Mesh(new THREE.BoxGeometry(.16,.1,20),edgeMat);e.position.set(center+side*(ROAD_HALF-.3),.16,z);e.rotation.y=-angle;roadGroup.add(e)}
  if(Math.floor((z+TRACK_LEN/2)/18)%2===0){const dash=new THREE.Mesh(new THREE.BoxGeometry(.13,.06,8),material('#f6f2d5',.6,0));dash.position.set(center,.18,z);dash.rotation.y=-angle;roadGroup.add(dash)}
  if(Math.abs(z)%54<9){for(const side of[-1,1])spawnScenery(center+side*(15+Math.random()*14),z)}
 }
}
function spawnScenery(x,z){const type=state.track;let o;if(type==='city'){const h=8+Math.random()*24,w=6+Math.random()*8; o=box(scene,[w,h,7+Math.random()*6],['#172532','#233544','#1c2933'][Math.floor(Math.random()*3)],x,h/2,z);for(let y=4;y<h;y+=4){const win=box(scene,[.7,.65,.08],Math.random()>.4?'#ffd166':'#42c8ff',x,y,z-3.6);win.castShadow=false}}
 else if(type==='desert'){const g=new THREE.Group();const h=3+Math.random()*4;box(g,[.7,h,.7],'#47733d',0,h/2,0);if(Math.random()>.5)box(g,[2,.45,.45],'#47733d',x>0?-1:1,h*.55,0);g.position.set(x,0,z);scene.add(g);o=g}
 else {const r=1.5+Math.random()*3;o=new THREE.Mesh(new THREE.DodecahedronGeometry(r,0),material('#4a525b',1,0));o.position.set(x,r*.5,z);o.scale.y=.7;scene.add(o)}scenery.push(o)}
function startWorld(){
 $('pause').classList.add('hidden');$('busted').classList.add('hidden');$('finish').classList.add('hidden');
 scene=new THREE.Scene();const t=tracks[state.track];scene.background=new THREE.Color(t.sky);scene.fog=new THREE.Fog(t.sky,65,250);
 camera=new THREE.PerspectiveCamera(67,innerWidth/innerHeight,.1,600);renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));renderer.setSize(innerWidth,innerHeight);renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;$('game').prepend(renderer.domElement);clock=new THREE.Clock();
 scene.add(new THREE.HemisphereLight('#d8e9ff','#1a241b',1.8));const sun=new THREE.DirectionalLight('#fff0d0',2.4);sun.position.set(-45,80,35);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);scene.add(sun);
 makeRoad();player=makeCar(state.car,state.paint,false);const startZ=TRACK_LEN/2-70;player.position.set(curve(startZ),.05,startZ);scene.add(player);
 traffic=[];for(let i=0;i<10;i++){const type=['audi','range','thar'][i%3],lane=[-5,-2.5,0,2.5,5][i%5],z=startZ-170-i*205;const v=45+Math.random()*55;const c=makeCar(type,['#e8e8e8','#3d6cff','#f2b84b','#d84343','#56d27a'][i%5]);c.userData={lane,speed:v};c.position.set(curve(z)+lane,.02,z);scene.add(c);traffic.push(c)}
 police=[];speed=0;nitro=100;heat=0;worldTime=0;lap=1;lapDistance=0;totalDistance=0;raceTime=0;heading=0;checkpoint=0;running=true;paused=false;keys={};
 camera.position.set(player.position.x,5.2,player.position.z+10);camera.lookAt(player.position.x,1,player.position.z-25);bindTouch();showMessage('3 • 2 • 1 • GO!');clock.start();requestAnimationFrame(loop)
}
function endWorld(){running=false;if(renderer){renderer.dispose();renderer.domElement.remove()}scene=null;player=null;traffic=[];police=[];roadPieces=[];scenery=[]}
function crash(){speed*=.3;heat=Math.min(100,heat+15);showMessage('CRASH!');beep(100,.08)}
function spawnPolice(){if(police.length>=3)return;const p=makeCar('audi','#e9eef4',true);p.userData={speed:52+Math.random()*15,lane:(Math.random()*2-1)*5};p.position.set(curve(player.position.z+55)+p.userData.lane,.03,player.position.z+55);scene.add(p);police.push(p)}
function beep(freq,duration){try{const C=window.AudioContext||window.webkitAudioContext;if(!C)return;const ac=beep.ctx||(beep.ctx=new C());const o=ac.createOscillator(),g=ac.createGain();o.frequency.value=freq;o.type='sawtooth';g.gain.setValueAtTime(.035,ac.currentTime);g.gain.exponentialRampToValueAtTime(.001,ac.currentTime+duration);o.connect(g);g.connect(ac.destination);o.start();o.stop(ac.currentTime+duration)}catch(_) {}}
function updateTraffic(dt){for(const t of traffic){let z=t.position.z-dt*t.userData.speed*.82;t.position.z=z;t.position.x=curve(z)+t.userData.lane;t.rotation.y=-curveSlope(z);if(z<player.position.z-90){z+=TRACK_LEN;t.position.z=z;t.position.x=curve(z)+t.userData.lane}}
 for(const t of traffic){const dx=Math.abs(t.position.x-player.position.x),dz=Math.abs(t.position.z-player.position.z);if(dx<2.0&&dz<3.0)crash()}}
function updatePolice(dt){if(heat>35&&worldTime>9)spawnPolice();for(const p of police){const targetZ=player.position.z+20;p.position.z+=Math.sign(targetZ-p.position.z)*Math.min(Math.abs(targetZ-p.position.z),p.userData.speed*dt*.8);p.position.x+=(player.position.x-p.position.x)*.65*dt;p.rotation.y=-curveSlope(p.position.z);if(Math.abs(p.position.z-player.position.z)<4.6&&Math.abs(p.position.x-player.position.x)<2.3){heat=Math.min(100,heat+28*dt);if(heat>=100){busted();return}}}}
function loop(){if(!running)return;requestAnimationFrame(loop);const dt=Math.min(clock.getDelta(),.035);if(paused){renderer.render(scene,camera);return}worldTime+=dt;raceTime+=dt;const c=cfg[state.car];const max=c.max+state.engine*12,acc=c.acc+state.engine*7;const accel=keys.accel||keys.up,brake=keys.brake||keys.down,steer=(keys.left?-1:0)+(keys.right?1:0),boost=keys.nitro&&nitro>0&&speed>25;
 if(accel)speed+=acc*dt;else speed-=13*dt;if(brake)speed-=72*dt;if(boost){speed+=(90+state.nitroLevel*14)*dt;nitro=Math.max(0,nitro-(30-state.nitroLevel*2)*dt)}else nitro=Math.min(100+state.nitroLevel*5,nitro+(6+state.nitroLevel)*dt);speed=Math.max(-20,Math.min(max*(boost?1.23:1),speed));
 heading+=steer*(c.turn+.15*state.engine)*(0.45+Math.min(Math.abs(speed),180)/210)*dt;const lateral=steer*(2.4+Math.abs(speed)/65)*dt;player.position.x+=Math.sin(heading)*speed*.065*dt+lateral;player.position.z-=Math.cos(heading)*speed*.86*dt;player.rotation.y=heading*.48;
 const center=curve(player.position.z),offset=player.position.x-center;if(Math.abs(offset)>ROAD_HALF-1){speed*=.96;player.position.x=center+Math.max(-ROAD_HALF+1,Math.min(ROAD_HALF-1,offset))}
 lapDistance=Math.min(TRACK_LEN,Math.max(0,(TRACK_LEN/2-70)-player.position.z));totalDistance=(lap-1)*TRACK_LEN+lapDistance;const pct=Math.floor(totalDistance/(TRACK_LEN*LAPS)*100);const newCheckpoint=Math.floor((lapDistance/TRACK_LEN)*8);if(newCheckpoint>checkpoint){checkpoint=newCheckpoint;showMessage('CHECKPOINT '+(newCheckpoint+1)+'/8');beep(520,.06)}
 if(lapDistance>=TRACK_LEN){if(lap<LAPS){lap++;lapDistance=0;checkpoint=0;player.position.z=TRACK_LEN/2-70;player.position.x=curve(player.position.z)+offset*.35;showMessage('LAP '+lap+' / '+LAPS);beep(740,.12)}else{finishRace();return}}
 if(pct>state.best){state.best=pct;if(pct%5===0)persist()}updateTraffic(dt);updatePolice(dt);if(!running)return;heat=Math.max(0,heat-4*dt);
 const target=new THREE.Vector3(player.position.x*.55,4.8,player.position.z+10);camera.position.lerp(target,1-Math.pow(.001,dt));camera.lookAt(player.position.x*.22,1.1,player.position.z-23);renderer.render(scene,camera);updateHud(pct)
}
function updateHud(pct){$('hudSpeed').textContent=Math.round(Math.max(0,speed));$('hudGear').textContent=speed<1?'N':speed<35?'1':speed<65?'2':speed<100?'3':speed<140?'4':speed<180?'5':'6';$('hudLap').textContent=`${lap}/${LAPS}`;$('hudRace').textContent=pct+'%';$('hudNitro').textContent=Math.round(nitro)+'%';$('raceProgressFill').style.width=pct+'%';const a=$('policeAlert');if(heat>70){a.textContent='POLICE HOT';a.className='alert hot'}else if(heat>35){a.textContent='POLICE ALERT';a.className='alert warn'}else a.textContent='CLEAR'}
function finishRace(){running=false;state.wins++;const reward=25000+Math.max(0,Math.round((100-raceTime)*120));state.cash+=reward;state.best=100;persist();$('finishText').innerHTML=`<b>${state.playerId||'Racer'}</b> finished ${tracks[state.track].name}.<br>Time: ${raceTime.toFixed(1)}s · Reward: ₹${reward.toLocaleString()} · Wins: ${state.wins}`;$('finish').classList.remove('hidden');beep(880,.3)}
function busted(){running=false;$('bustedText').textContent='The police caught you. Use Nitro wisely and stay on the road.';$('busted').classList.remove('hidden');beep(120,.4)}
function showMessage(text){const m=$('message');m.textContent=text;m.style.opacity='1';clearTimeout(showMessage.timer);showMessage.timer=setTimeout(()=>m.style.opacity='0',900)}
async function start(){const playerId=$('playerId').value.trim()||'Racer';const password=$('password').value;const msg=$('authMessage');msg.textContent='';msg.className='authMessage';$('startBtn').disabled=true;
 if(password){try{const data=await authenticate(playerId,password);authToken=data.token;localStorage.setItem('nitroVelocity3D_token',authToken);state.playerId=data.playerId;await pullCloudSave();msg.textContent='Cloud profile ready.';msg.className='authMessage good'}catch(e){authToken=null;localStorage.removeItem('nitroVelocity3D_token');state.playerId=playerId;msg.textContent=e.message||'Cloud sign-in failed; using guest mode.';msg.className='authMessage bad'}}else state.playerId=playerId;
 state.car=$('carSelect').value;state.track=$('trackSelect').value;saveLocal();pushCloudSave();$('startBtn').disabled=false;$('menu').classList.add('hidden');$('garage').classList.add('hidden');$('controls').classList.add('hidden');$('game').classList.remove('hidden');startWorld()}
$('startBtn').onclick=start;$('retryBtn').onclick=()=>{ $('busted').classList.add('hidden');startWorld()};$('finishRetry').onclick=()=>{ $('finish').classList.add('hidden');startWorld()};$('garageReturn').onclick=()=>{endWorld();$('game').classList.add('hidden');show('garage')};$('finishGarage').onclick=()=>{endWorld();$('game').classList.add('hidden');show('garage')};
function togglePause(){if(!running)return;paused=!paused;$('pause').classList.toggle('hidden',!paused);if(!paused)clock.start()}$('resumeBtn').onclick=togglePause;$('quitBtn').onclick=()=>{endWorld();$('game').classList.add('hidden');show('menu');setMenuValues()};
addEventListener('keydown',e=>{const k=e.key.toLowerCase();if(['arrowup','arrowdown','arrowleft','arrowright',' '].includes(e.key)||['w','a','s','d','p'].includes(k))e.preventDefault();if(k==='p')togglePause();if(k==='w'||e.key==='ArrowUp')keys.up=true;if(k==='s'||e.key==='ArrowDown')keys.down=true;if(k==='a'||e.key==='ArrowLeft')keys.left=true;if(k==='d'||e.key==='ArrowRight')keys.right=true;if(e.key===' ')keys.nitro=true;keys.accel=keys.up;keys.brake=keys.down});
addEventListener('keyup',e=>{const k=e.key.toLowerCase();if(k==='w'||e.key==='ArrowUp')keys.up=false;if(k==='s'||e.key==='ArrowDown')keys.down=false;if(k==='a'||e.key==='ArrowLeft')keys.left=false;if(k==='d'||e.key==='ArrowRight')keys.right=false;if(e.key===' ')keys.nitro=false;keys.accel=keys.up;keys.brake=keys.down});
function bindTouch(){document.querySelectorAll('[data-control]').forEach(b=>{if(b.dataset.bound)return;b.dataset.bound='1';const c=b.dataset.control;const on=e=>{e.preventDefault();keys[c]=true;if(c==='accel')keys.accel=true;if(c==='brake')keys.brake=true;if(c==='nitro')keys.nitro=true};const off=e=>{e.preventDefault();keys[c]=false;if(c==='accel')keys.accel=false;if(c==='brake')keys.brake=false;if(c==='nitro')keys.nitro=false};b.addEventListener('pointerdown',on);b.addEventListener('pointerup',off);b.addEventListener('pointercancel',off);b.addEventListener('pointerleave',off)})}
addEventListener('resize',()=>{if(camera&&renderer){camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight)}});
})();
