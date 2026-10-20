const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
app.use(express.static(path.join(__dirname, "public")));
app.get("/health", (_req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3000;
const rooms = new Map();
const questions = {
  "Sport": [
    [100,"Wie viele Spieler stehen bei einer Fußballmannschaft regulär gleichzeitig auf dem Platz?","11"],
    [200,"Wie lang ist ein Marathon?","42,195 Kilometer"],
    [300,"In welcher Sportart gibt es den Begriff Ippon?","Judo"],
    [400,"Welches Land gewann die Rugby-WM der Männer 2023?","Südafrika"],
    [500,"Wer hält den Männer-Weltrekord über 100 Meter?","Usain Bolt (9,58 Sekunden)"]
  ],
  "Flaggen": [
    [100,"Welche Farben hat die deutsche Flagge von oben nach unten?","Schwarz, Rot, Gold"],
    [200,"Welches Land hat ein rotes Ahornblatt auf der Flagge?","Kanada"],
    [300,"Welches Land hat eine Flagge mit weißem Kreuz auf rotem Grund?","Schweiz"],
    [400,"Welches Land hat als einziges eine nicht rechteckige Nationalflagge?","Nepal"],
    [500,"Welches Land zeigt auf seiner Flagge ein AK-47-Gewehr?","Mosambik"]
  ],
  "Allgemeinwissen": [
    [100,"Wie viele Minuten hat eine Stunde?","60"],
    [200,"Welcher Planet ist der Sonne am nächsten?","Merkur"],
    [300,"Wie heißt die Hauptstadt von Australien?","Canberra"],
    [400,"Welches chemische Symbol hat Silber?","Ag"],
    [500,"Wie heißt die Grenze zwischen Erdkruste und Erdmantel?","Mohorovičić-Diskontinuität (Moho)"]
  ],
  "Gaming": [
    [100,"Wie heißt der grüne Dinosaurier aus vielen Mario-Spielen?","Yoshi"],
    [200,"Welche Firma entwickelt Minecraft?","Mojang Studios"],
    [300,"Wie heißt die Währung in Fortnite?","V-Bucks"],
    [400,"In welchem Jahr erschien die erste PlayStation in Japan?","1994"],
    [500,"Wie heißt die Region der ersten Pokémon-Spiele?","Kanto"]
  ],
  "Zurück in die Schule": [
    [100,"Wie viel ist 7 × 8?","56"],
    [200,"Wie nennt man ein Wort, das ein Hauptwort näher beschreibt?","Adjektiv"],
    [300,"Wie viele Seiten hat ein Hexagon?","6"],
    [400,"Was ist die chemische Formel von Wasser?","H₂O"],
    [500,"Wie nennt man den Vorgang, bei dem Pflanzen Licht in chemische Energie umwandeln?","Fotosynthese"]
  ],
  "Marken": [
    [100,"Welche Marke hat einen angebissenen Apfel als Logo?","Apple"],
    [200,"Welche Sportmarke ist für drei Streifen bekannt?","Adidas"],
    [300,"Welche Automarke verwendet vier ineinanderliegende Ringe?","Audi"],
    [400,"Welche schwedische Möbelmarke ist für Selbstbaumöbel bekannt?","IKEA"],
    [500,"Welche Firma entwickelte die Nintendo Switch?","Nintendo"]
  ]
};
const categories = Object.fromEntries(Object.entries(questions).map(([cat, qs]) =>
  [cat, qs.map(([value, question, answer]) => ({ value, question, answer }))]
));

function state(room) {
  return {
    code: room.code, status: room.status,
    players: [...room.players.values()].map(p => ({ id:p.id, name:p.name, score:p.score, host:p.host })),
    used: [...room.used], current: room.current ? {
      category:room.current.category, value:room.current.value,
      question:room.current.question, answer:room.reveal ? room.current.answer : null
    } : null,
    buzzWinner: room.buzzWinner, buzzOpen: room.buzzOpen,
    buzzEndsAt: room.buzzEndsAt, reveal: room.reveal
  };
}
function emit(room) { io.to(room.code).emit("state", state(room)); }
function getRoom(socket) { for (const r of rooms.values()) if (r.players.has(socket.id)) return r; return null; }
function reply(cb, ok, error) { if (typeof cb === "function") cb(error ? {ok:false,error} : {ok:true}); }
io.on("connection", socket => {
  socket.on("createRoom", ({name}, cb) => {
    let code;
    do { code = Math.random().toString(36).slice(2,7).toUpperCase(); } while (rooms.has(code));
    const room = {code, players:new Map(), used:new Set(), current:null, buzzWinner:null,
      buzzOpen:false, buzzEndsAt:null, reveal:false, status:"lobby", hostId:socket.id};
    room.players.set(socket.id, {id:socket.id,name:String(name||"Host").slice(0,24),score:0,host:true});
    rooms.set(code, room); socket.join(code);
    if (cb) cb({ok:true,code,state:state(room)}); emit(room);
  });
  socket.on("joinRoom", ({code,name}, cb) => {
    const room = rooms.get(String(code||"").trim().toUpperCase());
    if (!room) return cb?.({ok:false,error:"Spielcode nicht gefunden."});
    if (room.status !== "lobby") return cb?.({ok:false,error:"Das Spiel läuft bereits."});
    room.players.set(socket.id,{id:socket.id,name:String(name||"Spieler").slice(0,24),score:0,host:false});
    socket.join(room.code); cb?.({ok:true,code:room.code,state:state(room)}); emit(room);
  });
  socket.on("startGame", (_,cb) => {
    const r=getRoom(socket); if(!r||r.hostId!==socket.id) return reply(cb,false,"Nur der Host kann starten.");
    if(r.players.size<2) return reply(cb,false,"Mindestens zwei Spieler werden benötigt.");
    r.status="game"; emit(r); reply(cb,true);
  });
  socket.on("chooseQuestion", ({category,value},cb) => {
    const r=getRoom(socket); if(!r||r.hostId!==socket.id) return reply(cb,false,"Nur der Host kann Fragen auswählen.");
    const q=(categories[category]||[]).find(x=>x.value===Number(value)), key=`${category}|${Number(value)}`;
    if(!q||r.used.has(key)||r.current) return reply(cb,false,"Diese Frage ist nicht verfügbar.");
    r.current={category,value:Number(value),question:q.question,answer:q.answer,key};
    r.buzzWinner=null;r.buzzOpen=false;r.buzzEndsAt=null;r.reveal=false;emit(r);reply(cb,true);
  });
  socket.on("markWrong",(_,cb)=>{
    const r=getRoom(socket);if(!r||r.hostId!==socket.id||!r.current)return reply(cb,false,"Nicht möglich.");
    r.buzzWinner=null;r.buzzOpen=true;r.buzzEndsAt=Date.now()+10000;emit(r);
    setTimeout(()=>{if(rooms.has(r.code)&&r.buzzOpen&&Date.now()>=r.buzzEndsAt){r.buzzOpen=false;r.buzzEndsAt=null;emit(r);}},10100);
    reply(cb,true);
  });
  socket.on("buzz",(_,cb)=>{
    const r=getRoom(socket);if(!r||!r.buzzOpen||r.buzzWinner)return reply(cb,false,"Buzzer ist geschlossen.");
    if(Date.now()>r.buzzEndsAt){r.buzzOpen=false;r.buzzEndsAt=null;emit(r);return reply(cb,false,"Zeit abgelaufen.");}
    r.buzzWinner=socket.id;r.buzzOpen=false;r.buzzEndsAt=null;emit(r);reply(cb,true);
  });
  socket.on("awardPoints",({playerId,delta},cb)=>{
    const r=getRoom(socket);if(!r||r.hostId!==socket.id||!r.current)return reply(cb,false,"Nicht möglich.");
    const p=r.players.get(playerId);if(!p)return reply(cb,false,"Spieler nicht gefunden.");
    const n=Number(delta);if(!Number.isFinite(n)||Math.abs(n)>1000)return reply(cb,false,"Ungültige Punktzahl.");
    p.score+=n;emit(r);reply(cb,true);
  });
  socket.on("revealAnswer",(_,cb)=>{const r=getRoom(socket);if(!r||r.hostId!==socket.id||!r.current)return reply(cb,false,"Nicht möglich.");r.reveal=true;emit(r);reply(cb,true);});
  socket.on("nextQuestion",(_,cb)=>{const r=getRoom(socket);if(!r||r.hostId!==socket.id||!r.current)return reply(cb,false,"Nicht möglich.");r.used.add(r.current.key);r.current=null;r.buzzWinner=null;r.buzzOpen=false;r.buzzEndsAt=null;r.reveal=false;emit(r);reply(cb,true);});
  socket.on("disconnect",()=>{
    const r=getRoom(socket);if(!r)return;r.players.delete(socket.id);
    if(!r.players.size)rooms.delete(r.code);
    else {if(r.hostId===socket.id){const p=r.players.values().next().value;r.hostId=p.id;p.host=true;}emit(r);}
  });
});
server.listen(PORT,"0.0.0.0",()=>console.log(`Quizduell läuft auf Port ${PORT}`));
