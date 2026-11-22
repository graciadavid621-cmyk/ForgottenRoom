(() => {
  const { metro, plugin, ui } = vendetta;
  const { React, ReactNative: RN, FluxDispatcher } = metro.common;
  const { findByProps, findByStoreName } = metro;
  const h = React.createElement;
  const mem = { eggs: 0, hint: null, lastHint: null };
  const store = () => {
    try {
      const s = plugin && plugin.storage;
      if (s && typeof s === "object") return s;
    } catch (e) {}
    return mem;
  };
  const { Modal, View, Text, Pressable } = RN;

  const CHANCE = 0.04;      // random room chance per channel switch
  const COOLDOWN = 60000;   // ms between rooms
  const KEY = "forgotten-room";
  const PREFIX = "* ";
  const U = 14;             // pixel size
  const MONO = RN.Platform.OS === "ios" ? "Courier" : "monospace";

  const ASK = "Well, there's a man here";
  const GOT = "You got an Egg";
  const EMPTY = [
    "There's nothing else here.",
    "Only silence now.",
    "The tree stands there, doing tree things.",
    "...",
  ];

  const TREE = [
    "....LLLL....",
    "..LLLLLLLL..",
    ".LLLLLLLLLL.",
    "LLLLLLLLLLLL",
    ".LLLLLLLLLL.",
    "..LLLLLLLL..",
    ".....TT.....",
    ".....TT.....",
    ".....TT.....",
  ];

  const PALETTES = [
    { path: "#b9a4ff", trunk: "#4b2a8a", leaves: "#ff8ad8", w: 6 },
    { path: "#ffb48a", trunk: "#5a1f1f", leaves: "#ffd35a", w: 3 },
    { path: "#a8f0ff", trunk: "#1f3a6b", leaves: "#e8fbff", w: 2 },
    { path: "#a8e6a1", trunk: "#2a4a2a", leaves: "#f4ff8a", w: 2 },
    { path: "#ffffff", trunk: "#555555", leaves: "#999999", w: 1 },
  ];

  const T = (id, hints, test) => ({ id, hints, test });
  const nameIs = (re) => (c) => !!c && re.test(c.name || "");
  const typeIs = (...t) => (c) => !!c && t.indexOf(c.type) !== -1;

  const TRIGGERS = [
    T("dm", [
      "Look where only two voices echo.",
      "Knock on a door that has just one other person behind it.",
    ], typeIs(1)),
    T("groupdm", [
      "A small crowd, hidden away from the town square.",
      "Try a room where a few friends whisper together.",
    ], typeIs(3)),
    T("voice", [
      "It is loud where nobody types. Go where voices live.",
      "Somewhere with speakers but no keyboards.",
    ], typeIs(2, 13)),
    T("announce", [
      "Visit the place where the town crier shouts and nobody answers.",
      "A channel that only announces.",
    ], typeIs(5)),
    T("thread", [
      "Follow a loose thread.",
      "Something small, branching off from something bigger.",
    ], typeIs(11, 12)),
    T("forum", [
      "A board of pinned ideas. Post-ed notes everywhere.",
      "Where conversations are filed like paperwork.",
    ], typeIs(15)),
    T("general", [
      "Where every stranger says hello.",
      "The most crowded room in any house.",
    ], nameIs(/general|chat|lobby|lounge/i)),
    T("memes", [
      "Go where nothing is serious and nothing is on topic.",
      "Somewhere between jokes and chaos.",
    ], nameIs(/meme|shitpost|off-?topic|random|funny/i)),
    T("bots", [
      "Where the machines take commands.",
      "Spam is welcome there. Mostly by robots.",
    ], nameIs(/bot|command|spam|cmd/i)),
    T("music", [
      "Follow the sound of a faint melody.",
      "A room that hums.",
    ], nameIs(/music|song|radio|vc|karaoke/i)),
    T("rules", [
      "Read the fine print. Start with the welcome mat.",
      "Where the laws of the land are written.",
    ], nameIs(/rule|welcome|info|faq|about|start/i)),
    T("night", [
      "Come back when the world is asleep. Midnight to four.",
      "It only opens in the dead of night.",
    ], () => new Date().getHours() < 4),
    T("morning", [
      "Early birds only. Before the sun is high.",
      "Come at dawn, between five and eight.",
    ], () => { const x = new Date().getHours(); return x >= 5 && x < 8; }),
    T("weekend", [
      "It rests on the weekend, and so should you.",
      "Saturday and Sunday, when nobody's working.",
    ], () => { const d = new Date().getDay(); return d === 0 || d === 6; }),
    T("rapid", [
      "Be restless. Flick through places faster than you can think.",
      "Don't settle. Keep moving, keep switching.",
    ], (c, ctx) => ctx.rapid >= 6),
  ];

  let open = false;
  let lastShown = 0;
  let recent = [];
  let dismiss = () => {};

  function pickHint(lastId) {
    const pool = TRIGGERS.filter((t) => t.id !== lastId);
    const t = pool[Math.floor(Math.random() * pool.length)];
    return { id: t.id, text: t.hints[Math.floor(Math.random() * t.hints.length)] };
  }

  function pickPalette(first) {
    if (first) return PALETTES[0];
    const total = PALETTES.reduce((a, p) => a + p.w, 0);
    let r = Math.random() * total;
    for (const p of PALETTES) { r -= p.w; if (r <= 0) return p; }
    return PALETTES[0];
  }

  function useTypewriter(text) {
    const [n, setN] = React.useState(0);
    React.useEffect(() => {
      setN(0);
      if (!text) return;
      let i = 0;
      const id = setInterval(() => {
        i++;
        setN(i);
        if (i >= text.length) clearInterval(id);
      }, 35);
      return () => clearInterval(id);
    }, [text]);
    return [text.slice(0, n), n >= text.length, () => setN(text.length)];
  }

  function Room(props) {
    const { palette, layout, treeOffset } = props;
    const [stage, setStage] = React.useState("walk");
    const [hintText, setHintText] = React.useState("");
    const [emptyText, setEmptyText] = React.useState("");
    const [taken, setTaken] = React.useState(false);
    const [sel, setSel] = React.useState(0);

    const text =
      stage === "ask" ? PREFIX + ASK :
      stage === "got" ? PREFIX + GOT :
      stage === "hint" ? hintText :
      stage === "empty" ? emptyText : "";
    const [shown, done, skip] = useTypewriter(text);

    const advance = () => {
      if (stage === "walk" || stage === "ask") return;
      if (!done) return skip();
      if (stage === "got") setStage("hint");
      else if (stage === "hint") props.onClose();
      else if (stage === "empty") setStage("walk");
    };

    const touchTree = () => {
      if (stage !== "walk") return;
      if (taken) {
        setEmptyText(PREFIX + EMPTY[Math.floor(Math.random() * EMPTY.length)]);
        setStage("empty");
      } else setStage("ask");
    };

    const yes = () => {
      const s = store();
      const prev = s.hint ? s.hint.id : s.lastHint;
      const nh = pickHint(prev);
      s.eggs = (s.eggs || 0) + 1;
      s.hint = nh;
      s.lastHint = nh.id;
      setHintText(PREFIX + nh.text);
      setTaken(true);
      setStage("got");
    };

    const rows = TREE.map((row, y) => {
      const parts = [];
      let i = 0;
      while (i < row.length) {
        let j = i;
        while (j < row.length && row[j] === row[i]) j++;
        const c = row[i];
        parts.push(h(View, {
          key: i,
          style: {
            width: (j - i) * U, height: U,
            backgroundColor: c === "L" ? palette.leaves : c === "T" ? palette.trunk : "transparent",
          },
        }));
        i = j;
      }
      return h(View, { key: y, style: { flexDirection: "row" } }, parts);
    });

    const opt = (label, i) =>
      h(Pressable, {
        onPressIn: () => setSel(i),
        onPress: i === 0 ? yes : props.onClose,
        style: { padding: 8 },
      },
        h(Text, { style: { color: "#fff", fontSize: 20, fontFamily: MONO } },
          h(Text, { style: { color: "#ff0000" } }, sel === i ? "\u2665 " : "  "),
          label));

    const pw = 7;
    return h(Modal, {
      visible: true, animationType: "fade", transparent: false,
      statusBarTranslucent: true, onRequestClose: props.onClose,
    },
      h(Pressable, { style: { flex: 1, backgroundColor: "#000" }, onPress: advance },
        h(View, { style: {
          position: "absolute", top: 0, bottom: 0, left: "50%",
          width: U * pw, marginLeft: -(U * pw) / 2, backgroundColor: palette.path,
        } }),
        layout === "t" && h(View, { style: {
          position: "absolute", left: 0, right: 0, top: "34%",
          height: U * 5, backgroundColor: palette.path,
        } }),
        h(Pressable, { onPress: touchTree, style: {
          position: "absolute", top: "14%", left: "50%",
          marginLeft: -(12 * U) / 2 + treeOffset,
        } }, rows),
        h(Text, { style: {
          position: "absolute", bottom: "28%", left: "50%", marginLeft: -10,
          color: "#ff0000", fontSize: 22,
        } }, "\u2665"),
        h(Text, { style: {
          position: "absolute", top: 40, left: 16, color: "#444", fontFamily: MONO,
        } }, "EGGS " + (store().eggs || 0)),
        stage !== "walk" && h(View, { style: {
          position: "absolute", left: "5%", right: "5%", bottom: "6%",
          minHeight: 130, padding: 16, backgroundColor: "#000",
          borderWidth: 4, borderColor: "#fff",
        } },
          h(Text, { style: { color: "#fff", fontSize: 20, fontFamily: MONO } }, shown),
          stage === "ask" && done && h(View, { style: {
            flexDirection: "row", marginTop: 18, justifyContent: "space-around",
          } }, opt("Yes", 0), opt("No", 1)))));
  }

  function showRoom() {
    if (open) return;
    open = true;
    lastShown = Date.now();
    const first = !(store().eggs > 0);
    const el = h(Room, {
      palette: pickPalette(first),
      layout: first || Math.random() < 0.6 ? "straight" : "t",
      treeOffset: first ? 0 : (Math.floor(Math.random() * 5) - 2) * U,
      onClose: () => { open = false; dismiss(); },
    });
    try {
      const A = findByProps("openAlert", "dismissAlert");
      if (A) { A.openAlert(KEY, el); dismiss = () => A.dismissAlert(KEY); return; }
      const L = findByProps("openLazy", "close");
      if (L) {
        L.openLazy({ importer: async () => () => el, extraProps: {} });
        dismiss = () => L.close();
        return;
      }
      throw new Error("no alert host");
    } catch (e) {
      open = false;
      try { ui.toasts.showToast("ForgottenRoom: couldn't open the room"); } catch (e2) {}
    }
  }

  function onSelect(e) {
    try {
      const now = Date.now();
      recent = recent.filter((t) => now - t < 8000);
      recent.push(now);
      if (open || now - lastShown < COOLDOWN) return;
      const store = findByStoreName("ChannelStore");
      const channel = e && e.channelId && store ? store.getChannel(e.channelId) : null;
      const hint = store().hint;
      const trig = hint && TRIGGERS.find((t) => t.id === hint.id);
      const fired = trig && trig.test(channel, { rapid: recent.length });
      if (fired || Math.random() < CHANCE) setTimeout(showRoom, 350);
    } catch (err) {}
  }

  function Settings() {
    const btn = (label, fn) =>
      h(Pressable, { onPress: fn, style: { padding: 14, margin: 8, backgroundColor: "#333", borderRadius: 8 } },
        h(Text, { style: { color: "#fff" } }, label));
    return h(View, { style: { padding: 8 } },
      h(Text, { style: { color: "#fff", margin: 8 } }, "Eggs collected: " + (store().eggs || 0)),
      btn("Open the room now", showRoom),
      btn("Reset eggs and hint", () => { store().eggs = 0; store().hint = null; }));
  }

  return {
    onLoad() {
      try {
        const s = store();
        if (typeof s.eggs !== "number") s.eggs = 0;
        if (s.hint === undefined) s.hint = null;
      } catch (e) {}
      FluxDispatcher.subscribe("CHANNEL_SELECT", onSelect);
    },
    onUnload() {
      FluxDispatcher.unsubscribe("CHANNEL_SELECT", onSelect);
      open = false;
      try { dismiss(); } catch (e) {}
    },
    settings: Settings,
  };
})()
