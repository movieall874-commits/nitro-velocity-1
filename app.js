(() => {
'use strict';
const $=id=>document.getElementById(id);
const API='/api';
const state=JSON.parse(localStorage.getItem('nitroVelocity3D')||'null')||{playerId:'',car:'audi',track:'city',paint:'#ff6a00',wheel:'sport',best:0,cash:125000};
let authToken=localStorage.getItem('nitroVelocity3D_token')||null;

// Local save always happens (works offline). If logged in to the cloud
// backend, the same data is also pushed to the database so it follows
// the player to any device.
const save=()=>{localStorage.setItem('nitroVelocity3D',JSON.stringify(state));pushCloudSave()};

async function apiCall(path,opts={}){
  const res=await fetch(API+path,{...opts,headers:{'Content-Type':'application/json',...(authToken?{Authorization:'Bearer '+authToken}:{}),...(opts.headers||{})}});
  const data=await res.json().catch(()=>({}));
  if(!res.ok){const err=new Error(data.error||'Request failed');err.status=res.status;throw err}
  return data;
}

// Log in if the profile exists; if not, create it (mirrors the
// "create / enter profile" flow players already know). Returns true on
// success, false if it should fall back to offline/guest play.
async function authenticate(playerId,password){
  try{
    const data=await apiCall('/auth/login',{method:'POST',body:JSON.stringify({playerId,password})});
    return data;
  }catch(loginErr){
    if(loginErr.status===401){
      try{
        const data=await apiCall('/auth/register',{method:'POST',body:JSON.stringify({playerId,password})});
        return data;
      }catch(registerErr){
        if(registerErr.status===409)throw new Error('Wrong password for that Player ID.');
        throw registerErr;
      }
    }
    throw loginErr;
  }
}

async function pullCloudSave(){
  try{
    const data=await apiCall('/save');
    Object.assign(state,data);
  }catch(e){ /* offline or token expired — keep local state */ }
}

async function pushCloudSave(){
  if(!authToken)return;
  try{
    await apiCall('/save',{method:'PUT',body:JSON.stringify({car:state.car,track:state.track,paint:state.paint,wheel:state.wheel,best:state.best,cash:state.cash})});
  }catch(e){ /* offline — local copy already saved, will retry on next save() */ }
}

$('playerId').value=state.playerId;$('carSelect').value=state.car;$('trackSelect').value=state.track;$('garageCar').value=state.car;$('paint').value=state.paint;$('wheel').value=state.wheel;
$('saved').textContent=state.playerId?`Saved player: ${state.playerId} · Best race: ${state.best}%${authToken?' · Cloud sync ON':''}`:'';
function show(id){['menu','garage','controls'].forEach(x=>$(x).classList.add('hidden'));$(id).classList.remove('hidden')}
$('garageBtn').onclick=()=>show('garage');$('howBtn').onclick=()=>show('controls');document.querySelectorAll('[data-back]').forEach(b=>b.onclick=()=>show('menu'));
$('garageCar').onchange=()=>{state.car=$('garageCar').value};$('paint').onchange=()=>{state.paint=$('paint').value};$('wheel').onchange=()=>{state.wheel=$('wheel').value};$('saveGarage').onclick=()=>{state.car=$('garageCar').value;state.paint=$('paint').value;state.wheel=$('wheel').value;save();$('saved').textContent='Car customization saved.'};
$('downloadBtn').onclick=()=>{const html='<!doctype html>\n'+document.documentElement.outerHTML;const blob=new Blob([html],{type:'text/html'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='Nitro-Velocity-3D.html';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)};
let scene,camera,renderer,clock,player,roadGroup,traffic=[],police=[],keys={},running=false,paused=false,trackLen=2800,distance=0,speed=0,heading=0,nitro=100,heat=0,checkpoint=0,roadHalf=9,worldTime=0;
const cfg={audi:{w:1.9,h:1.05,l:4.4,max:235,acc:62,color:'#ff6a00'},range:{w:2.15,h:1.25,l:4.9,max:195,acc:50,color:'#20242a'},thar:{w:2.0,h:1.35,l:4.0,max:175,acc:47,color:'#2c6cff'}};
function mat(c,rough=1,metal=0){return new THREE.MeshStandardMaterial({color:c,roughness:rough,metalness:metal})}
function box(g,s,c,x,y,z,rx=0){const m=new THREE.Mesh(new THREE.BoxGeometry(s[0],s[1],s[2]),mat(c,.65,.15));m.position.set(x,y,z);m.rotation.y=rx;g.add(m);return m}
function makeCar(type,color,isPolice=false){const c=cfg[type]||cfg.audi,g=new THREE.Group();const body=box(g,[c.w,c.h,c.l],color,0,.75,0);body.castShadow=true;const cabin=box(g,[c.w*.82,c.h*.72,c.l*.48],isPolice?'#e9eef4':'#101820',0,1.38,-.15);cabin.castShadow=true;
const wheelMat=mat(isPolice?'#101010':(state.wheel==='offroad'?'#3c3c3c':'#151515'),.5,.5);for(const x of[-c.w*.58,c.w*.58])for(const z of[-c.l*.32,c.l*.32]){const w=new THREE.Mesh(new THREE.CylinderGeometry(.38,.38,.22,18),wheelMat);w.rotation.z=Math.PI/2;w.position.set(x,.42,z);g.add(w)}
if(isPolice){box(g,[c.w*.72,.13,.55],'#17222d',0,1.85,0);const red=box(g,[.28,.16,.22],'#ff1e1e',-.3,1.98,0);const blue=box(g,[.28,.16,.22],'#2388ff',.3,1.98,0)}return g}
function makeRoad(){roadGroup=new THREE.Group();scene.add(roadGroup);const asphalt=mat('#20252b',1,0),line=mat('#f6f2d5',.7,0),side=mat('#5d3d28',1,0);for(let z=-trackLen/2;z<trackLen/2;z+=40){const r=new THREE.Mesh(new THREE.BoxGeometry(roadHalf*2,0.25,40),asphalt);r.position.set(0,0,z);r.receiveShadow=true;roadGroup.add(r);for(const x of[-roadHalf-.8,roadHalf+.8]){const s=new THREE.Mesh(new THREE.BoxGeometry(.25,.12,40),side);s.position.set(x,.16,z);roadGroup.add(s)}const dash=new THREE.Mesh(new THREE.BoxGeometry(.16,.05,14),line);dash.position.set(0,.18,z+4);roadGroup.add(dash)}
const ground=box(roadGroup,[120,.2,trackLen+400],'#172319',0,-.16,0);ground.receiveShadow=true;
const track=state.track;for(let z=-trackLen/2-100;z<trackLen/2+100;z+=55){for(const sideX of[-1,1]){const x=sideX*(16+Math.random()*20);if(track==='city')makeBuilding(x,z);else if(track==='desert')makeCactus(x,z);else makeRock(x,z)}}}
function makeBuilding(x,z){const h=8+Math.random()*28,w=7+Math.random()*8,d=7+Math.random()*9;const b=box(scene,[w,h,d],'#202d3a',x,h/2,z);for(let yy=4;yy<h;yy+=4)for(let xx=-w/2+1;xx<w/2-1;xx+=2.3)box(scene,[.8,.7,.08],Math.random()>.35?'#ffd166':'#48c8ff',x+xx,yy,z-d/2-.05);}
function makeCactus(x,z){const h=3+Math.random()*4;const g=new THREE.Group();box(g,[.65,h,.65],'#3c7041',0,h/2,0);if(Math.random()>.4)box(g,[2,.5,.5],'#3c7041',x>0?-.8:.8,h*.55,0);g.position.set(x,0,z);scene.add(g)}
function makeRock(x,z){const r=1.5+Math.random()*3;const m=new THREE.Mesh(new THREE.DodecahedronGeometry(r,0),mat('#4a4f57',1,0));m.position.set(x,r*.55,z);m.scale.y=.7;scene.add(m)}
function resetWorld(){if(renderer){renderer.dispose();$('game').innerHTML='';const hud=document.createElement('div');hud.id='hud';hud.innerHTML='<div><b id="hudSpeed">0</b><small>KM/H</small></div><div><b id="hudGear">N</b><small>GEAR</small></div><div class="wide"><b id="hudRace">0%</b><small>RACE</small></div><div class="alert" id="policeAlert">CLEAR</div>';$('game').append(hud);const cross=document.createElement('div');cross.id='crosshair';cross.textContent='+';$('game').append(cross);const mm=document.createElement('div');mm.id='minimap';mm.innerHTML='<canvas id="mapCanvas" width="180" height="180"></canvas>';$('game').append(mm);const touch=document.createElement('div');touch.id='touch';touch.innerHTML='<button data-control="left">◀</button><button data-control="brake">BRAKE</button><button data-control="accel" class="accel">ACCEL</button><button data-control="nitro" class="nitro">NITRO</button><button data-control="right">▶</button>';$('game').append(touch);bindTouch();}
scene=new THREE.Scene();scene.fog=new THREE.Fog('#0a1016',55,210);scene.background=new THREE.Color('#09131c');camera=new THREE.PerspectiveCamera(68,innerWidth/innerHeight,.1,500);renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(devicePixelRatio,1.7));renderer.setSize(innerWidth,innerHeight);renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;$('game').prepend(renderer.domElement);clock=new THREE.Clock();
const hemi=new THREE.HemisphereLight('#d7e9ff','#182018',1.8);scene.add(hemi);const sun=new THREE.DirectionalLight('#fff4dc',2.6);sun.position.set(-40,70,30);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);scene.add(sun);
makeRoad();player=makeCar(state.car,state.paint,false);player.position.set(0,.05,trackLen/2-55);scene.add(player);camera.position.set(0,5,player.position.z+10);camera.lookAt(0,1,player.position.z-25);
traffic=[];police=[];for(let i=0;i<12;i++){const t=makeCar(i%3===0?'audi':i%3===1?'range':'thar',['#e8e8e8','#3d6cff','#f2b84b','#d84343'][i%4]);t.position.set((Math.random()*2-1)*7,0,-trackLen/2+120+i*180);t.userData.speed=40+Math.random()*55;scene.add(t);traffic.push(t)}
distance=0;speed=0;heading=0;nitro=100;heat=0;checkpoint=0;worldTime=0;running=true;paused=false;requestAnimationFrame(loop)}
function spawnPolice(){if(police.length>=3)return;const p=makeCar('audi','#e8e8e8',true);p.position.set((Math.random()>.5?1:-1)*7,.05,player.position.z+55);scene.add(p);police.push(p)}
function crash(){speed*=.35;heat=Math.min(100,heat+18);showMessage('CRASH!');}
function showMessage(t){const m=document.createElement('div');m.id='message';m.textContent=t;$('game').append(m);setTimeout(()=>m.remove(),900)}
function loop(){if(!running)return;requestAnimationFrame(loop);const dt=Math.min(clock.getDelta(),.04);if(paused){renderer.render(scene,camera);return}worldTime+=dt;const c=cfg[state.car];const accel=keys.accel||keys.up,brake=keys.brake||keys.down,left=keys.left,right=keys.right,boost=keys.nitro;
if(accel)speed+=c.acc*dt;else speed-=18*dt;if(brake)speed-=75*dt;if(boost&&nitro>0&&speed>25){speed+=95*dt;nitro=Math.max(0,nitro-34*dt)}else nitro=Math.min(100,nitro+7*dt);speed=Math.max(-25,Math.min(c.max*(boost?1.25:1),speed));const steer=(left?-1:0)+(right?1:0);heading+=steer*(0.72+speed/380)*dt;player.position.x+=Math.sin(heading)*speed*.085*dt;player.position.z-=Math.cos(heading)*speed*.9*dt;player.rotation.y=heading*.55;
if(Math.abs(player.position.x)>roadHalf-1.0){speed*=.94;player.position.x=Math.max(-roadHalf+1,Math.min(roadHalf-1,player.position.x));}
distance=Math.min(trackLen,Math.max(0,(trackLen/2-55)-player.position.z));const pct=Math.floor(distance/trackLen*100);checkpoint=Math.floor(pct/25);if(pct>=100){finishRace();return}if(pct>state.best){state.best=pct;save()}
for(const t of traffic){t.position.z-=t.userData.speed*.9*dt;if(t.position.z>player.position.z+100)t.position.z-=trackLen;if(t.position.z<player.position.z-100)t.position.z+=trackLen;const dx=Math.abs(t.position.x-player.position.x),dz=Math.abs(t.position.z-player.position.z);if(dx<2.1&&dz<3.2)crash()}
if(heat>28&&worldTime>12)spawnPolice();for(const p of police){const dz=player.position.z-p.position.z;p.position.z+=Math.sign(dz)*Math.min(Math.abs(dz),55*dt);p.position.x+=(player.position.x-p.position.x)*.8*dt;if(Math.abs(p.position.z-player.position.z)<5&&Math.abs(p.position.x-player.position.x)<2.4){heat+=32*dt;if(heat>100){busted();return}}}
heat=Math.max(0,heat-3.5*dt);const target=new THREE.Vector3(player.position.x*.55,4.5,player.position.z+10);camera.position.lerp(target,1-Math.pow(.001,dt));camera.lookAt(player.position.x*.25,1,player.position.z-25);renderer.render(scene,camera);updateHud(pct)}
function updateHud(pct){const km=Math.round(Math.max(0,speed));$('hudSpeed').textContent=km;$('hudGear').textContent=speed<1?'N':speed<35?'1':speed<65?'2':speed<100?'3':speed<140?'4':speed<180?'5':'6';$('hudRace').textContent=pct+'%';const a=$('policeAlert');if(heat>70){a.textContent='POLICE HOT';a.className='alert hot'}else if(heat>28){a.textContent='POLICE ALERT';a.className='alert warn'}else{a.textContent='CLEAR';a.className='alert'}}
function finishRace(){running=false;state.best=100;save();$('finishText').textContent=`${state.playerId||'Racer'} finished the ${state.track} track at ${Math.round(speed)} km/h.`;$('finish').classList.remove('hidden')}
function busted(){running=false;$('busted').classList.remove('hidden');$('bustedText').textContent='The police caught you. Try using the road and Nitro more carefully.'}
async function start(){
  const playerId=$('playerId').value.trim()||'Racer';
  const password=$('password').value;
  const msg=$('authMessage');
  msg.textContent='';msg.className='authMessage';
  if(password){
    $('startBtn').disabled=true;
    try{
      const data=await authenticate(playerId,password);
      authToken=data.token;
      localStorage.setItem('nitroVelocity3D_token',authToken);
      state.playerId=data.playerId;
      await pullCloudSave();
      msg.textContent='Signed in — cloud save synced.';msg.className='authMessage good';
    }catch(e){
      $('startBtn').disabled=false;
      msg.textContent=e.message||'Sign-in failed. Playing offline instead.';msg.className='authMessage bad';
      authToken=null;localStorage.removeItem('nitroVelocity3D_token');
      state.playerId=playerId;
    }
    $('startBtn').disabled=false;
  }else{
    // No password entered — guest/offline mode, same as before.
    state.playerId=playerId;authToken=null;localStorage.removeItem('nitroVelocity3D_token');
  }
  state.car=$('carSelect').value;state.track=$('trackSelect').value;state.paint=$('paint').value;
  save();
  $('menu').classList.add('hidden');$('garage').classList.add('hidden');$('controls').classList.add('hidden');$('game').classList.remove('hidden');resetWorld();
}
$('startBtn').onclick=start;$('retryBtn').onclick=()=>{$('busted').classList.add('hidden');resetWorld()};$('finishRetry').onclick=()=>{$('finish').classList.add('hidden');resetWorld()};$('garageReturn').onclick=()=>{location.reload()};$('finishGarage').onclick=()=>{location.reload()};
function pause(){if(!running)return;paused=!paused;$('pause').classList.toggle('hidden',!paused)}$('resumeBtn').onclick=pause;$('quitBtn').onclick=()=>location.reload();
addEventListener('keydown',e=>{const k=e.key.toLowerCase();if(['arrowup','arrowdown','arrowleft','arrowright',' '].includes(e.key)||['w','a','s','d','p'].includes(k))e.preventDefault();if(k==='p')pause();keys.up=k==='w'||e.key==='ArrowUp'?true:keys.up;keys.down=k==='s'||e.key==='ArrowDown'?true:keys.down;keys.left=k==='a'||e.key==='ArrowLeft'?true:keys.left;keys.right=k==='d'||e.key==='ArrowRight'?true:keys.right;keys.accel=keys.up;keys.brake=keys.down;keys.nitro=e.key===' '?true:keys.nitro});addEventListener('keyup',e=>{const k=e.key.toLowerCase();if(k==='w'||e.key==='ArrowUp')keys.up=false;if(k==='s'||e.key==='ArrowDown')keys.down=false;if(k==='a'||e.key==='ArrowLeft')keys.left=false;if(k==='d'||e.key==='ArrowRight')keys.right=false;if(e.key===' ')keys.nitro=false;keys.accel=keys.up;keys.brake=keys.down});
function bindTouch(){document.querySelectorAll('[data-control]').forEach(b=>{const c=b.dataset.control;const on=ev=>{ev.preventDefault();keys[c]=true;if(c==='accel')keys.accel=true;if(c==='brake')keys.brake=true};const off=ev=>{ev.preventDefault();keys[c]=false;if(c==='accel')keys.accel=false;if(c==='brake')keys.brake=false};b.addEventListener('pointerdown',on);b.addEventListener('pointerup',off);b.addEventListener('pointercancel',off);b.addEventListener('pointerleave',off)})}
addEventListener('resize',()=>{if(!camera||!renderer)return;camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight)});
})();
