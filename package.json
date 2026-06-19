const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const bedrock = require('bedrock-protocol');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const session = require('express-session');

const app = express();
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(session({
  secret: 'mySecretKey123',
  resave: false,
  saveUninitialized: true
}));

const DATA_FILE = './bot_data.json';
let botConfig = {
  host: '',
  port: 19132,
  username: '',
  botCallName: 'مساعد',
  admins: [],
  jailCoords: null,
  warnings: {},
  geminiKey: '',
  reverseArabic: false,
  useWhitelistForBan: false,
  webPassword: '',
  adhkarIntervalMinutes: 4,
  msgJail: 'تم نقل اللاعب {player} إلى السجن وتغيير وضعه إلى مغامرة.',
  msgWarn: 'انذار للاعب {player}... لديه الان {warns} إنذار',
  msgBan: 'تم حظر اللاعب {player} لمدة {minutes} دقيقة.',
  msgClear: 'تم تنظيف الأرض وحذف جميع الأدوات الملقاة.',
  adhkar: [
    "🤍 سبحان الله وبحمده، سبحان الله العظيم.",
    "💫 لا إله إلا الله وحده لا شريك له، له الملك وله الحمد وهو على كل شيء قدير.",
    "🌸 اللهم صلِّ وسلم وبارك على نبينا محمد.",
    "✨ أستغفر الله العظيم وأتوب إليه.",
    "🛡️ لا حول ولا قوة إلا بالله العلي العظيم.",
    "☀️ سبحان الله، والحمد لله، ولا إله إلا الله، والله أكبر.",
    "🤲 اللهم إنك عفو كريم تحب العفو فاعفُ عنا.",
    "💎 حسبي الله ونعم الوكيل.",
    "🌿 رضيت بالله رباً، وبالإسلام ديناً، وبمحمد ﷺ نبياً.",
    "🕯️ يا حي يا قيوم برحمتك أستغيث، أصلح لي شأني كله ولا تكلني إلى نفسي طرفة عين."
  ]
};

if (fs.existsSync(DATA_FILE)) {
  const fileData = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  botConfig = { ...botConfig, ...fileData };
}

function saveData() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(botConfig, null, 2));
}

let bot = null;
let adhkarInterval = null;
let afkInterval = null;

function fixArabicText(text) {
  if (!text) return '';
  if (botConfig.reverseArabic) {
    return text.split('').reverse().join('');
  }
  return text;
}

function sendCommand(cmdText) {
  if (!bot) return;
  bot.queue('command_request', {
    command: cmdText,
    origin: {
      type: 0,
      uuid: '00000000-0000-0000-0000-000000000000',
      request_id: '00000000-0000-0000-0000-000000000000'
    },
    internal: false,
    version: 38
  });
}

function sendChatMessage(msg) {
  sendCommand(`say ${fixArabicText(msg)}`);
}

async function askGemini(prompt) {
  if (!botConfig.geminiKey) return "⚠️ لم يتم إعداد مفتاح الذكاء الاصطناعي.";
  try {
    const genAI = new GoogleGenerativeAI(botConfig.geminiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash",
      systemInstruction: `أنت بوت إداري لسيرفر ماينكرافت بيدروك اسمك "${botConfig.botCallName}". أجب بإيجاز بالعربية وبأسلوب لطيف يناسب الشات.`,
      generationConfig: { maxOutputTokens: 150, temperature: 0.7 }
    });
    const result = await model.generateContent(prompt);
    return result.response.text();
  } catch (error) {
    return "⚠️ حدث خطأ في الاتصال بالذكاء الاصطناعي.";
  }
}

function handleAdminCommand(sender, commandBody) {
  const args = commandBody.trim().split(/\s+/);
  const cmd = args[0]?.toLowerCase();
  const target = args.slice(1).join(' ');

  switch (cmd) {
    case 'حدد':
    case 'تحديد':
      if (target === 'السجن') {
        sendCommand(`tickingarea remove jail_area`);
        sendCommand(`kill @e[type=armor_stand,name="jail_marker"]`);
        sendCommand(`execute at "${sender}" run tickingarea add circle ~ ~ ~ 1 jail_area`);
        sendCommand(`execute at "${sender}" run summon armor_stand "jail_marker" ~ ~ ~`);
        botConfig.jailCoords = `عند موقع ${sender}`;
        saveData();
        sendChatMessage(`✅ تم حفظ موقع السجن الحالي بنجاح.`);
      }
      break;

    case 'سجن':
    case 'اسجن':
      if (botConfig.jailCoords) {
        sendCommand(`execute at @e[type=armor_stand,name="jail_marker"] run tp "${target}" ~ ~ ~`);
        sendCommand(`gamemode adventure "${target}"`);
        sendCommand(`tag "${target}" add "مسجون"`);
        sendChatMessage(botConfig.msgJail.replace('{player}', target));
      } else {
        sendChatMessage("❌ لم يتم تحديد موقع السجن. اكتب: يا بوت حدد السجن");
      }
      break;

    case 'انذار':
    case 'انزار':
      if (!botConfig.warnings[target]) botConfig.warnings[target] = 0;
      botConfig.warnings[target]++;
      saveData();
      sendCommand(`tag "${target}" add "⚠️_إنذار_${botConfig.warnings[target]}"`);
      sendChatMessage(botConfig.msgWarn.replace('{player}', target).replace('{warns}', botConfig.warnings[target]));
      break;

    case 'حظر':
    case 'احظر':
      if (!botConfig.warnings[target] || botConfig.warnings[target] < 2) {
        sendChatMessage(`❌ لا يمكن حظر ${target} إلا بعد الحصول على إنذارين.`);
        return;
      }
      const minutes = parseInt(args[2]) || 5;
      if (botConfig.useWhitelistForBan) {
        sendCommand(`whitelist remove "${target}"`);
        sendCommand(`kick "${target}" تم حظرك مؤقتاً لمدة ${minutes} دقيقة`);
        sendChatMessage(botConfig.msgBan.replace('{player}', target).replace('{minutes}', minutes));
        setTimeout(() => {
          sendCommand(`whitelist add "${target}"`);
          sendChatMessage(`🔓 تم رفع الحظر عن ${target} ويمكنه الدخول الآن.`);
          botConfig.warnings[target] = 0;
          saveData();
        }, minutes * 60000);
      } else {
        sendCommand(`kick "${target}" تم حظرك لمدة ${minutes} دقيقة`);
        sendChatMessage(botConfig.msgBan.replace('{player}', target).replace('{minutes}', minutes));
        setTimeout(() => {
          botConfig.warnings[target] = 0;
          saveData();
          sendChatMessage(`🔓 انتهت مدة حظر ${target} ويمكنه الدخول الآن.`);
        }, minutes * 60000);
      }
      break;

    case 'مسح':
      if (target === 'الانذارات' || target === 'إنذارات' || target === 'الإنذارات') {
        const player = args[2];
        if (player) {
          botConfig.warnings[player] = 0;
          saveData();
          sendCommand(`tag "${player}" remove "⚠️_إنذار_1"`);
          sendCommand(`tag "${player}" remove "⚠️_إنذار_2"`);
          sendCommand(`tag "${player}" remove "⚠️_إنذار_3"`);
          sendChatMessage(`✅ تم مسح إنذارات اللاعب ${player}.`);
        }
      }
      break;

    case 'نظف':
    case 'نظف_الأرض':
      sendCommand('kill @e[type=item]');
      sendChatMessage(botConfig.msgClear);
      break;

    case 'وقت':
    case 'time':
      const timeVal = args[1];
      if (timeVal && !isNaN(timeVal)) {
        sendCommand(`time set ${timeVal}`);
        sendChatMessage(`⏰ تم تغيير الوقت إلى ${timeVal}.`);
      } else {
        sendChatMessage("❌ استخدم: وقت <رقم>");
      }
      break;

    case 'طقس':
    case 'weather':
      const weatherType = args[1];
      if (weatherType === 'صافي' || weatherType === 'clear') {
        sendCommand('weather clear');
        sendChatMessage('☀️ تم تغيير الطقس إلى صافي.');
      } else if (weatherType === 'ممطر' || weatherType === 'rain') {
        sendCommand('weather rain');
        sendChatMessage('🌧️ تم تغيير الطقس إلى ممطر.');
      } else if (weatherType === 'رعد' || weatherType === 'thunder') {
        sendCommand('weather thunder');
        sendChatMessage('⛈️ تم تغيير الطقس إلى رعد.');
      } else {
        sendChatMessage("❌ استخدم: طقس <صافي/ممطر/رعد>");
      }
      break;

    case 'عنوان':
    case 'title':
      const titlePlayer = args[1];
      const titleText = args.slice(2).join(' ');
      if (titlePlayer && titleText) {
        sendCommand(`titleraw ${titlePlayer} title {"rawtext":[{"text":"${fixArabicText(titleText)}"}]}`);
        sendChatMessage(`📢 تم إرسال عنوان إلى ${titlePlayer}.`);
      } else {
        sendChatMessage("❌ استخدم: عنوان <اللاعب> <النص>");
      }
      break;

    case 'رسالة':
    case 'msg':
    case 'tell':
      const msgPlayer = args[1];
      const msgText = args.slice(2).join(' ');
      if (msgPlayer && msgText) {
        sendCommand(`tell "${msgPlayer}" "${fixArabicText(msgText)}"`);
      }
      break;

    case 'مسح_الشات':
    case 'clearchat':
      for (let i = 0; i < 100; i++) sendChatMessage(' ');
      sendChatMessage('🧹 تم مسح الشات.');
      break;

    case 'حالة':
    case 'status':
      if (bot) {
        const players = Object.keys(bot.players || {}).filter(p => p !== bot.username);
        sendChatMessage(`🟢 اللاعبون المتصلون: ${players.length} - ${players.join(', ') || 'لا أحد'}`);
      }
      break;

    case 'إنذارات':
    case 'انذارات':
      const checkPlayer = args[1] || sender;
      const count = botConfig.warnings[checkPlayer] || 0;
      sendChatMessage(`📋 عدد إنذارات ${checkPlayer}: ${count}`);
      break;

    default:
      return askGemini(commandBody);
  }
}

function startBotLogic() {
  if (bot) return;

  bot = bedrock.createClient({
    host: botConfig.host,
    port: parseInt(botConfig.port),
    username: botConfig.username,
    offline: false,
    authflow: 'microsoft'
  });

  bot.on('spawn', () => {
    console.log('✅ البوت دخل السيرفر بنجاح!');

    if (adhkarInterval) clearInterval(adhkarInterval);
    adhkarInterval = setInterval(() => {
      if (botConfig.adhkar.length > 0) {
        const randomZikr = botConfig.adhkar[Math.floor(Math.random() * botConfig.adhkar.length)];
        sendChatMessage(randomZikr);
      }
    }, (botConfig.adhkarIntervalMinutes || 4) * 60000);

    if (afkInterval) clearInterval(afkInterval);
    afkInterval = setInterval(() => {
      const yaw = Math.random() * 360;
      const pitch = Math.random() * 180 - 90;
      bot.queue('player_auth_input', {
        pitch: pitch,
        yaw: yaw,
        position: { x: 0, y: 0, z: 0 },
        move_vector: { x: 0, z: 0 },
        head_yaw: yaw,
        input_data: 0,
        input_mode: 1,
        play_mode: 0,
        tick: 0,
        delta: { x: 0, y: 0, z: 0 }
      });
    }, 15000);
  });

  bot.on('player_join', (packet) => {
    const name = packet.player.name;
    if (name !== botConfig.username) {
      sendChatMessage(`👋 مرحباً بك في السيرفر يا ${name} !`);
    }
  });

  bot.on('text', (packet) => {
    if (packet.type !== 'chat') return;
    const sender = packet.source_name;
    const message = packet.message.trim();

    if (sender === botConfig.username) return;

    const hasWarningTag = bot.players?.[sender]?.tags?.some(tag => tag.startsWith('⚠️_إنذار_'));
    if (hasWarningTag) {
      if (message.startsWith(`يا ${botConfig.botCallName}`)) {
        sendChatMessage(`🔇 عذراً، أنت مكتوم ولا يمكنك استخدام البوت حالياً.`);
      }
      return;
    }

    if (botConfig.admins.includes(sender)) {
      const prefix = `يا ${botConfig.botCallName}`;
      if (message.toLowerCase().startsWith(prefix.toLowerCase())) {
        const commandBody = message.substring(prefix.length).trim();
        handleAdminCommand(sender, commandBody).then(response => {
          if (response) sendChatMessage(response);
        });
      }
    }
  });

  bot.on('close', () => {
    console.log('⚠️ انفصل البوت، إعادة المحاولة بعد 10 ثوان...');
    bot = null;
    setTimeout(startBotLogic, 10000);
  });

  bot.on('error', (err) => {
    console.error('حدث خطأ:', err);
  });
}

function requireAuth(req, res, next) {
  if (botConfig.webPassword && !req.session.authenticated) {
    if (req.body && req.body.password === botConfig.webPassword) {
      req.session.authenticated = true;
      return next();
    } else {
      return res.send(`
        <html><body dir="rtl" style="text-align:center;font-family:Arial;background:#2c3e50;color:white;">
        <h2>🔐 الرجاء إدخال كلمة المرور</h2>
        <form method="POST"><input name="password" type="password" required><button type="submit">دخول</button></form>
        </body></html>`);
    }
  }
  next();
}

app.get('/', requireAuth, (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html dir="rtl">
    <head>
      <meta charset="UTF-8"><title>لوحة تحكم البوت الذكي</title>
      <style>
        body { background: #1e272e; color: #d2dae2; font-family: 'Segoe UI', Tahoma; padding: 20px; }
        .container { max-width: 800px; margin: auto; background: #2f3640; border-radius: 15px; padding: 25px; box-shadow: 0 4px 12px rgba(0,0,0,0.5); }
        input, textarea, button, select { width: 100%; padding: 12px; margin: 8px 0; border-radius: 8px; border: none; }
        button { background: #27ae60; color: white; font-weight: bold; cursor: pointer; }
        .danger { background: #c0392b; }
        ul { list-style: none; padding: 0; }
        li { background: #2c3e50; padding: 10px; margin: 5px 0; border-radius: 5px; display: flex; justify-content: space-between; }
      </style>
    </head>
    <body>
      <div class="container">
        <h2>🤖 لوحة تحكم بوت ماين كرافت بيدروك</h2>
        <p style="color:#f1c40f">حالة السجن: ${botConfig.jailCoords || 'غير محدد'}</p>
        <form action="/save" method="post">
          <h3>الإعدادات الأساسية</h3>
          <input name="botCallName" placeholder="اسم البوت" value="${botConfig.botCallName}">
          <input name="host" placeholder="IP السيرفر" value="${botConfig.host}">
          <input name="port" type="number" value="${botConfig.port}">
          <input name="username" placeholder="إيميل مايكروسوفت" value="${botConfig.username}">
          <input name="geminiKey" placeholder="مفتاح Gemini API">
          <input name="webPassword" placeholder="كلمة مرور لوحة التحكم" value="${botConfig.webPassword}">
          <label><input type="checkbox" name="reverseArabic" value="true" ${botConfig.reverseArabic?'checked':''}> عكس الحروف العربية</label>
          <label><input type="checkbox" name="useWhitelistForBan" value="true" ${botConfig.useWhitelistForBan?'checked':''}> استخدام whitelist للحظر المؤقت</label>
          <h3>نصوص مخصصة</h3>
          <input name="msgJail" placeholder="رسالة السجن" value="${botConfig.msgJail}">
          <input name="msgWarn" placeholder="رسالة الإنذار" value="${botConfig.msgWarn}">
          <input name="msgBan" placeholder="رسالة الحظر" value="${botConfig.msgBan}">
          <input name="msgClear" placeholder="رسالة تنظيف الأرض" value="${botConfig.msgClear}">
          <h3>الأذكار التلقائية</h3>
          <label>فترة الأذكار (بالدقائق):</label>
          <input type="number" name="adhkarIntervalMinutes" value="${botConfig.adhkarIntervalMinutes || 4}" min="1">
          <textarea name="adhkar" rows="5">${botConfig.adhkar.join('\n')}</textarea>
          <button type="submit">💾 حفظ وإعادة تشغيل البوت</button>
        </form>
        <hr/>
        <h3>المسؤولين</h3>
        <ul>${botConfig.admins.map(a => `<li>${a} <button class="danger" onclick="deleteAdmin('${a}')">حذف</button></li>`).join('')}</ul>
        <form action="/add-admin" method="post">
          <input name="adminName" placeholder="اسم Xbox">
          <button type="submit">➕ إضافة</button>
        </form>
      </div>
      <script>
        function deleteAdmin(name){ fetch('/delete-admin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name})}).then(()=>location.reload()); }
      </script>
    </body></html>
  `);
});

app.post('/save', (req, res) => {
  botConfig = { ...botConfig, ...req.body };
  botConfig.reverseArabic = req.body.reverseArabic === 'true';
  botConfig.useWhitelistForBan = req.body.useWhitelistForBan === 'true';
  botConfig.adhkarIntervalMinutes = parseInt(req.body.adhkarIntervalMinutes) || 4;
  botConfig.adhkar = req.body.adhkar.split('\n').map(l=>l.trim()).filter(l=>l);
  saveData();
  if (bot) bot.close();
  else startBotLogic();
  res.redirect('/');
});

app.post('/add-admin', requireAuth, (req, res) => {
  const name = req.body.adminName.trim();
  if (name && !botConfig.admins.includes(name)) {
    botConfig.admins.push(name);
    saveData();
  }
  res.redirect('/');
});

app.post('/delete-admin', requireAuth, (req, res) => {
  botConfig.admins = botConfig.admins.filter(a => a !== req.body.name);
  saveData();
  res.sendStatus(200);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🌐 لوحة التحكم: http://localhost:${PORT}`);
  if (botConfig.host && botConfig.username) startBotLogic();
});
