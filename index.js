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
  movementEnabled: true,
  movementRadius: 3,
  moveIntervalSeconds: 10,
  chatSimulationEnabled: true,
  simulationMessages: [
    "مرحباً بالجميع!",
    "كيف الحال؟",
    "اللعبة رائعة اليوم",
    "من يريد المساعدة؟",
    "ما الأخبار؟",
    "أنا هنا للمساعدة",
    "مرحباً بالأعضاء الجدد",
    "يوم سعيد للجميع",
    "بالتوفيق للكل",
    "هل من أحد يحتاج شيء؟"
  ],
  simulationIntervalMinutes: 5,
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
let moveInterval = null;
let simulationChatInterval = null;

// دوال مساعدة
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

// نظام الأوامر الإدارية المتكامل
function handleAdminCommand(sender, commandBody) {
  const args = commandBody.trim().split(/\s+/);
  const cmd = args[0]?.toLowerCase();
  const target = args.slice(1).join(' ');

  switch (cmd) {
    case 'مساعدة':
    case 'help': {
      const helpList = [
        '📋 **قائمة الأوامر الإدارية:**',
        `- يا ${botConfig.botCallName} **امر <أمر>** : تنفيذ أي أمر مباشر (للمسؤولين فقط)`,
        `- يا ${botConfig.botCallName} **اعطي <لاعب> <شيء> <كمية>** : إعطاء اللاعب أغراضاً`,
        `- يا ${botConfig.botCallName} **كلير <لاعب>** : مسح جرد اللاعب`,
        `- يا ${botConfig.botCallName} **جمب <لاعب> <طور>** : تغيير طور اللعبة`,
        `- يا ${botConfig.botCallName} **تايم <رقم>** : تغيير وقت السيرفر`,
        `- يا ${botConfig.botCallName} **ويزر <صافي/ممطر/رعد>** : تغيير الطقس`,
        `- يا ${botConfig.botCallName} **سجن <لاعب>** : سجن اللاعب`,
        `- يا ${botConfig.botCallName} **سجن حدد** : تحديد مكان السجن عند موقعك`,
        `- يا ${botConfig.botCallName} **فك سجن <لاعب>** : فك سجن اللاعب`,
        `- يا ${botConfig.botCallName} **كتم <لاعب>** : كتم اللاعب`,
        `- يا ${botConfig.botCallName} **فك كتم <لاعب>** : فك الكتم`,
        `- يا ${botConfig.botCallName} **طرد <لاعب> <سبب>** : طرد اللاعب`,
        `- يا ${botConfig.botCallName} **حظر <لاعب> <دقائق>** : حظر مؤقت (بعد إنذارين)`,
        `- يا ${botConfig.botCallName} **الغاء حظر <لاعب>** : إلغاء الحظر`,
        `- يا ${botConfig.botCallName} **انذار <لاعب>** : إعطاء إنذار`,
        `- يا ${botConfig.botCallName} **مسح إنذارات <لاعب>** : مسح كل الإنذارات`,
        `- يا ${botConfig.botCallName} **إنذارات <لاعب>** : عرض عدد إنذارات اللاعب`,
        `- يا ${botConfig.botCallName} **حالة** : عرض اللاعبين المتصلين`,
        `- يا ${botConfig.botCallName} **نظف** : حذف كل الأغراض الملقاة`,
        `- يا ${botConfig.botCallName} **مسح شات** : مسح الشات`,
        `- يا ${botConfig.botCallName} **عنوان <لاعب> <نص>** : إرسال عنوان على الشاشة`,
        `- يا ${botConfig.botCallName} **همس <لاعب> <نص>** : رسالة خاصة`,
        `- يا ${botConfig.botCallName} **استفسر <سؤال>** : اسأل الذكاء الاصطناعي (إن وُجد المفتاح)`,
        `- يا ${botConfig.botCallName} **مساعدة** : عرض هذه القائمة`
      ];
      sendChatMessage(helpList.join('\n'));
      break;
    }

    case 'امر':
      sendCommand(target);
      sendChatMessage(`✔️ تم تنفيذ الأمر: /${target}`);
      break;

    case 'اعطي':
    case 'give': {
      const gParts = target.split(' ');
      const gPlayer = gParts[0];
      const gItem = gParts[1] || 'stone';
      const gAmount = gParts[2] || '1';
      sendCommand(`give "${gPlayer}" ${gItem} ${gAmount}`);
      sendChatMessage(`🎁 تم إعطاء ${gPlayer} ${gAmount} × ${gItem}`);
      break;
    }

    case 'كلير':
    case 'clear': {
      const cPlayer = args[1];
      if (cPlayer) {
        sendCommand(`clear "${cPlayer}"`);
        sendChatMessage(`🗑️ تم مسح جرد اللاعب ${cPlayer}`);
      }
      break;
    }

    case 'جمب':
    case 'gamemode': {
      const gmParts = target.split(' ');
      const gmPlayer = gmParts[0];
      const gmMode = gmParts[1] || 'survival';
      sendCommand(`gamemode ${gmMode} "${gmPlayer}"`);
      sendChatMessage(`🎮 تم تغيير طور ${gmPlayer} إلى ${gmMode}`);
      break;
    }

    case 'تايم':
    case 'وقت':
    case 'time': {
      const timeVal = args[1];
      if (timeVal && !isNaN(timeVal)) {
        sendCommand(`time set ${timeVal}`);
        sendChatMessage(`⏰ تم تغيير الوقت إلى ${timeVal}`);
      } else {
        sendChatMessage("❌ استخدم: وقت <رقم>");
      }
      break;
    }

    case 'ويزر':
    case 'طقس':
    case 'weather': {
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
    }

    case 'سجن':
    case 'اسجن': {
      if (botConfig.jailCoords) {
        sendCommand(`execute at @e[type=armor_stand,name="jail_marker"] run tp "${target}" ~ ~ ~`);
        sendCommand(`gamemode adventure "${target}"`);
        sendCommand(`tag "${target}" add "مسجون"`);
        sendChatMessage(botConfig.msgJail.replace('{player}', target));
      } else {
        sendChatMessage("❌ لم يتم تحديد موقع السجن. اكتب: يا بوت سجن حدد");
      }
      break;
    }

    case 'فك':
      if (args[1]?.toLowerCase() === 'سجن' || args[1]?.toLowerCase() === 'السجن') {
        const unjailPlayer = args[2];
        if (unjailPlayer) {
          sendCommand(`tp "${unjailPlayer}" ~ ~ ~`);
          sendCommand(`gamemode survival "${unjailPlayer}"`);
          sendCommand(`tag "${unjailPlayer}" remove "مسجون"`);
          sendChatMessage(`🔓 تم فك سجن اللاعب ${unjailPlayer}`);
        }
      } else if (args[1]?.toLowerCase() === 'كتم' || args[1]?.toLowerCase() === 'الكتم') {
        const unmutePlayer = args[2];
        if (unmutePlayer) {
          sendCommand(`tag "${unmutePlayer}" remove "مكتوم"`);
          sendChatMessage(`🔊 تم فك الكتم عن ${unmutePlayer}`);
        }
      }
      break;

    case 'كتم':
    case 'mute': {
      const mutePlayer = args[1];
      if (mutePlayer) {
        sendCommand(`tag "${mutePlayer}" add "مكتوم"`);
        sendChatMessage(`🤫 تم كتم اللاعب ${mutePlayer}`);
      }
      break;
    }

    case 'طرد':
    case 'kick': {
      const kickParts = target.split(' ');
      const kickPlayer = kickParts[0];
      const kickReason = kickParts.slice(1).join(' ') || 'تم طردك';
      if (kickPlayer) {
        sendCommand(`kick "${kickPlayer}" ${kickReason}`);
        sendChatMessage(`👋 تم طرد ${kickPlayer}: ${kickReason}`);
      }
      break;
    }

    case 'حظر':
    case 'ban':
    case 'احظر': {
      const banParts = target.split(' ');
      const banPlayer = banParts[0];
      const banMinutes = parseInt(banParts[1]) || 5;
      if (!botConfig.warnings[banPlayer] || botConfig.warnings[banPlayer] < 2) {
        sendChatMessage(`❌ لا يمكن حظر ${banPlayer} إلا بعد الحصول على إنذارين.`);
        return;
      }
      if (botConfig.useWhitelistForBan) {
        sendCommand(`whitelist remove "${banPlayer}"`);
        sendCommand(`kick "${banPlayer}" تم حظرك مؤقتاً لمدة ${banMinutes} دقيقة`);
        sendChatMessage(botConfig.msgBan.replace('{player}', banPlayer).replace('{minutes}', banMinutes));
        setTimeout(() => {
          sendCommand(`whitelist add "${banPlayer}"`);
          sendChatMessage(`🔓 تم رفع الحظر عن ${banPlayer} ويمكنه الدخول الآن.`);
          botConfig.warnings[banPlayer] = 0;
          saveData();
        }, banMinutes * 60000);
      } else {
        sendCommand(`kick "${banPlayer}" تم حظرك لمدة ${banMinutes} دقيقة`);
        sendChatMessage(botConfig.msgBan.replace('{player}', banPlayer).replace('{minutes}', banMinutes));
        setTimeout(() => {
          botConfig.warnings[banPlayer] = 0;
          saveData();
          sendChatMessage(`🔓 انتهت مدة حظر ${banPlayer} ويمكنه الدخول الآن.`);
        }, banMinutes * 60000);
      }
      break;
    }

    case 'الغاء':
      if (args[1]?.toLowerCase() === 'حظر' || args[1]?.toLowerCase() === 'الحظر') {
        const unbanPlayer = args[2];
        if (unbanPlayer) {
          sendCommand(`whitelist add "${unbanPlayer}"`);
          sendChatMessage(`✅ تم إلغاء حظر ${unbanPlayer}`);
        }
      }
      break;

    case 'انذار':
    case 'انزار':
    case 'warn': {
      if (!botConfig.warnings[target]) botConfig.warnings[target] = 0;
      botConfig.warnings[target]++;
      saveData();
      sendCommand(`tag "${target}" add "⚠️_إنذار_${botConfig.warnings[target]}"`);
      sendChatMessage(botConfig.msgWarn.replace('{player}', target).replace('{warns}', botConfig.warnings[target]));
      break;
    }

    case 'مسح':
    case 'clearwarns':
      if (target.startsWith('انذارات') || target.startsWith('إنذارات') || target.startsWith('الإنذارات')) {
        const wpPlayer = args.slice(1).join(' ');
        if (wpPlayer) {
          botConfig.warnings[wpPlayer] = 0;
          saveData();
          for (let i = 1; i <= 5; i++) sendCommand(`tag "${wpPlayer}" remove "⚠️_إنذار_${i}"`);
          sendChatMessage(`✅ تم مسح إنذارات اللاعب ${wpPlayer}`);
        }
      }
      break;

    case 'نظف':
    case 'clearground':
      sendCommand('kill @e[type=item]');
      sendChatMessage(botConfig.msgClear);
      break;

    case 'حالة':
    case 'status':
      if (bot) {
        const players = Object.keys(bot.players || {}).filter(p => p !== bot.username);
        sendChatMessage(`🟢 اللاعبون المتصلون: ${players.length} - ${players.join(', ') || 'لا أحد'}`);
      }
      break;

    case 'مسح_الشات':
    case 'clearchat':
      for (let i = 0; i < 100; i++) sendChatMessage(' ');
      sendChatMessage('🧹 تم مسح الشات.');
      break;

    case 'انذارات':
    case 'warns':
    case 'الانذارات': {
      const checkPlayer = args[1] || sender;
      const count = botConfig.warnings[checkPlayer] || 0;
      sendChatMessage(`📋 عدد إنذارات ${checkPlayer}: ${count}`);
      break;
    }

    case 'عنوان':
    case 'title': {
      const tParts = target.split(' ');
      const tPlayer = tParts[0];
      const tText = tParts.slice(1).join(' ');
      if (tPlayer && tText) {
        sendCommand(`titleraw ${tPlayer} title {"rawtext":[{"text":"${fixArabicText(tText)}"}]}`);
        sendChatMessage(`📢 تم إرسال عنوان إلى ${tPlayer}`);
      }
      break;
    }

    case 'همس':
    case 'msg':
    case 'tell': {
      const mParts = target.split(' ');
      const mPlayer = mParts[0];
      const mText = mParts.slice(1).join(' ');
      if (mPlayer && mText) {
        sendCommand(`tell "${mPlayer}" "${fixArabicText(mText)}"`);
      }
      break;
    }

    case 'استفسر':
    case 'ask':
      return askGemini(target);

    // لو أرسل "سجن حدد" (لاحظنا أنه في بعض الحالات cmd يقرأ "سجن" فقط والtarget هو "حدد")
    // لذا أضفنا فحصاً: إذا كان cmd === 'سجن' والtarget === 'حدد' أو 'تحديد' يتم تحديد السجن
    // لكننا أضفنا case 'سجن' أعلاه، ولكن هذا الكود سيصل إلى هنا فقط إذا لم تتحقق الشروط أعلاه
    // لكن بما أننا وضعنا case 'سجن': ... فإنه لن يصل إلى default. لكن للاحتياط نضيف:
    case 'سجن':
      if (target === 'حدد' || target === 'تحديد') {
        sendCommand(`tickingarea remove jail_area`);
        sendCommand(`kill @e[type=armor_stand,name="jail_marker"]`);
        sendCommand(`execute at "${sender}" run tickingarea add circle ~ ~ ~ 1 jail_area`);
        sendCommand(`execute at "${sender}" run summon armor_stand "jail_marker" ~ ~ ~`);
        botConfig.jailCoords = `عند موقع ${sender}`;
        saveData();
        sendChatMessage(`✅ تم حفظ موقع السجن الحالي بنجاح.`);
      }
      break;

    default:
      return askGemini(commandBody);
  }
}

// حركة واقعية دورية
function performRandomMovement() {
  if (!bot || !botConfig.movementEnabled) return;
  const moveX = (Math.random() - 0.5) * 2 * (botConfig.movementRadius || 3);
  const moveZ = (Math.random() - 0.5) * 2 * (botConfig.movementRadius || 3);
  const yaw = Math.random() * 360;
  const pitch = Math.random() * 180 - 90;
  const jumping = Math.random() > 0.7;
  bot.queue('player_auth_input', {
    pitch, yaw,
    position: { x: moveX, y: jumping ? 1.2 : 0, z: moveZ },
    move_vector: { x: moveX, z: moveZ },
    head_yaw: yaw,
    input_data: jumping ? 0x01 : 0x00,
    input_mode: 2,
    play_mode: 0,
    tick: 0,
    delta: { x: 0, y: 0, z: 0 }
  });
  setTimeout(() => {
    if (!bot) return;
    bot.queue('player_auth_input', {
      pitch: 0, yaw,
      position: { x: 0, y: 0, z: 0 },
      move_vector: { x: 0, z: 0 },
      head_yaw: yaw,
      input_data: 0,
      input_mode: 1,
      play_mode: 0,
      tick: 0,
      delta: { x: 0, y: 0, z: 0 }
    });
  }, 1500);
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

    if (simulationChatInterval) clearInterval(simulationChatInterval);
    if (botConfig.chatSimulationEnabled && botConfig.simulationMessages.length > 0) {
      simulationChatInterval = setInterval(() => {
        const randomMsg = botConfig.simulationMessages[Math.floor(Math.random() * botConfig.simulationMessages.length)];
        sendChatMessage(randomMsg);
      }, (botConfig.simulationIntervalMinutes || 5) * 60000);
    }

    if (moveInterval) clearInterval(moveInterval);
    moveInterval = setInterval(performRandomMovement, (botConfig.moveIntervalSeconds || 10) * 1000);
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

    const isMuted = bot.players?.[sender]?.tags?.some(tag => tag === 'مكتوم');
    if (isMuted) {
      if (message.startsWith(`يا ${botConfig.botCallName}`)) {
        sendChatMessage(`🔇 أنت مكتوم ولا يمكنك استخدام البوت حالياً.`);
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
      <meta charset="UTF-8"><title>لوحة تحكم البوت الاحترافية</title>
      <style>
        body { background: #1e272e; color: #d2dae2; font-family: 'Segoe UI', Tahoma; padding: 20px; }
        .container { max-width: 800px; margin: auto; background: #2f3640; border-radius: 15px; padding: 25px; box-shadow: 0 4px 12px rgba(0,0,0,0.5); }
        input, textarea, button, select { width: 100%; padding: 12px; margin: 8px 0; border-radius: 8px; border: none; }
        button { background: #27ae60; color: white; font-weight: bold; cursor: pointer; }
        .danger { background: #c0392b; }
        ul { list-style: none; padding: 0; }
        li { background: #2c3e50; padding: 10px; margin: 5px 0; border-radius: 5px; display: flex; justify-content: space-between; }
        .section { margin: 25px 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <h2>🤖 لوحة تحكم البوت الاحترافي</h2>
        <p style="color:#f1c40f">حالة السجن: ${botConfig.jailCoords || 'غير محدد'}</p>
        <form action="/save" method="post">
          <div class="section">
            <h3>الإعدادات الأساسية</h3>
            <input name="botCallName" placeholder="اسم البوت" value="${botConfig.botCallName}">
            <input name="host" placeholder="IP السيرفر" value="${botConfig.host}">
            <input name="port" type="number" value="${botConfig.port}">
            <input name="username" placeholder="إيميل مايكروسوفت" value="${botConfig.username}">
            <input name="geminiKey" placeholder="مفتاح Gemini API">
            <input name="webPassword" placeholder="كلمة مرور لوحة التحكم" value="${botConfig.webPassword}">
            <label><input type="checkbox" name="reverseArabic" value="true" ${botConfig.reverseArabic?'checked':''}> عكس الحروف العربية</label>
            <label><input type="checkbox" name="useWhitelistForBan" value="true" ${botConfig.useWhitelistForBan?'checked':''}> استخدام whitelist للحظر المؤقت</label>
          </div>

          <div class="section">
            <h3>نصوص مخصصة</h3>
            <input name="msgJail" placeholder="رسالة السجن" value="${botConfig.msgJail}">
            <input name="msgWarn" placeholder="رسالة الإنذار" value="${botConfig.msgWarn}">
            <input name="msgBan" placeholder="رسالة الحظر" value="${botConfig.msgBan}">
            <input name="msgClear" placeholder="رسالة تنظيف الأرض" value="${botConfig.msgClear}">
          </div>

          <div class="section">
            <h3>نظام محاكاة النشاط</h3>
            <label>تفعيل الحركة الواقعية:</label>
            <input type="checkbox" name="movementEnabled" value="true" ${botConfig.movementEnabled?'checked':''}>
            <label>نصف قطر الحركة (بلوكات):</label>
            <input type="number" name="movementRadius" value="${botConfig.movementRadius || 3}">
            <label>فترة الحركة (بالثواني):</label>
            <input type="number" name="moveIntervalSeconds" value="${botConfig.moveIntervalSeconds || 10}">
            <label>تفعيل محاكاة الدردشة:</label>
            <input type="checkbox" name="chatSimulationEnabled" value="true" ${botConfig.chatSimulationEnabled?'checked':''}>
            <label>فترة رسائل المحاكاة (دقائق):</label>
            <input type="number" name="simulationIntervalMinutes" value="${botConfig.simulationIntervalMinutes || 5}">
            <label>رسائل المحاكاة (سطر لكل رسالة):</label>
            <textarea name="simulationMessages" rows="4">${botConfig.simulationMessages.join('\n')}</textarea>
          </div>

          <div class="section">
            <h3>الأذكار التلقائية</h3>
            <label>فترة الأذكار (بالدقائق):</label>
            <input type="number" name="adhkarIntervalMinutes" value="${botConfig.adhkarIntervalMinutes || 4}" min="1">
            <textarea name="adhkar" rows="5">${botConfig.adhkar.join('\n')}</textarea>
          </div>

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

app.post('/', requireAuth, (req, res) => res.redirect('/'));

app.post('/save', (req, res) => {
  botConfig = { ...botConfig, ...req.body };
  botConfig.reverseArabic = req.body.reverseArabic === 'true';
  botConfig.useWhitelistForBan = req.body.useWhitelistForBan === 'true';
  botConfig.movementEnabled = req.body.movementEnabled === 'true';
  botConfig.chatSimulationEnabled = req.body.chatSimulationEnabled === 'true';
  botConfig.adhkarIntervalMinutes = parseInt(req.body.adhkarIntervalMinutes) || 4;
  botConfig.moveIntervalSeconds = parseInt(req.body.moveIntervalSeconds) || 10;
  botConfig.simulationIntervalMinutes = parseInt(req.body.simulationIntervalMinutes) || 5;
  botConfig.adhkar = req.body.adhkar.split('\n').map(l=>l.trim()).filter(l=>l);
  botConfig.simulationMessages = req.body.simulationMessages ? req.body.simulationMessages.split('\n').map(l=>l.trim()).filter(l=>l) : [];
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
