/**
 * Phase 4 prototype: AI Narration + TTS.
 *
 * These are hand-authored "spoken" narration scripts for ~10 representative
 * stories from the demo journey, in English and Hindi. Each script is
 * derived ONLY from the existing verified short/long description and
 * narration_hint fields already stored for that content item (see
 * delhi-nainital-content-v1.json) — no facts have been invented.
 *
 * Keyed by the story's English title so it can be matched against whatever
 * package/simulate response is currently loaded, regardless of source.
 *
 * estimatedSeconds uses the same heuristic as backend/scripts/playback-report.ts
 * (word count / 140 wpm, minimum 8s) so Phase 4 timing numbers stay
 * comparable with the Phase 1 playback report.
 */

const WORDS_PER_MINUTE = 140;
const MIN_SECONDS = 8;

function estimateSeconds(text) {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(MIN_SECONDS, Math.round((words / WORDS_PER_MINUTE) * 60));
}

function entry(en, hi) {
  return {
    en: { script: en, estimatedSeconds: estimateSeconds(en) },
    hi: { script: hi, estimatedSeconds: estimateSeconds(hi) },
  };
}

export const narrationPrototype = {
  'Delhi was not just one city': entry(
    "Here's something surprising: today's Delhi isn't one city — it's built on layers of several historic cities. Delhi Tourism traces a whole succession of them: Lal Kot, Siri, Firozabad, Shergarh, Shahjahanabad, and finally New Delhi. Each one grew up around the older settlements before it, so as we drive out of the capital, we're really driving away from a city stacked many times over.",
    'एक दिलचस्प बात — आज की दिल्ली असल में एक नहीं, कई ऐतिहासिक शहरों की परतों से बनी है। दिल्ली पर्यटन के अनुसार इसमें लाल कोट, सिरी, फ़िरोज़ाबाद, शाहजहानाबाद और अब नई दिल्ली जैसे शहर शामिल हैं, जो एक-दूसरे के ऊपर बसते गए। तो जैसे ही हम राजधानी से बाहर निकलते हैं, हम असल में एक के ऊपर एक बसे शहरों को पीछे छोड़ रहे होते हैं।',
  ),

  "Humayun's Tomb helped shape Mughal architecture": entry(
    "Just off our route stands Humayun's Tomb, built in 1565 — one of the earliest grand examples of Mughal architecture in India. Delhi Tourism records that Bega Begam commissioned it. Its garden layout, water channels, and double dome are still considered defining features of that architectural style.",
    'हमारे रास्ते के पास हुमायूँ का मकबरा है, जो 1565 में बना — भारत में मुगल वास्तुकला का शुरुआती भव्य उदाहरण। दिल्ली पर्यटन के अनुसार इसे बेगा बेगम ने बनवाया था। इसका चारबाग, जल-नालियां और दोहरा गुंबद आज भी इस वास्तुशैली की पहचान माने जाते हैं।',
  ),

  'Ancient settlement evidence exists near the Hindon': entry(
    "Here's an interesting one to hold loosely: the Ghaziabad district administration reports that excavations at the Kaseri mound, near the Hindon river, point to a settlement here dating back to around 2500 BC — thousands of years before the modern NCR existed. It's a district government claim rather than an independently verified archaeological record, but it's a striking idea as you cross this ordinary-looking stretch of river.",
    'यह जानकारी थोड़ा सतर्क होकर सुनिए — गाज़ियाबाद जिला प्रशासन के अनुसार, हिंडन नदी के पास कसेरी टीले की खुदाई में करीब 2500 ईसा पूर्व की बसावट के प्रमाण मिले हैं, यानी आज के एनसीआर से हज़ारों साल पहले। यह जिला प्रशासन का दावा है, स्वतंत्र पुरातात्विक पुष्टि नहीं, लेकिन एक साधारण दिखने वाली नदी के पास यह विचार आश्चर्यजनक है।',
  ),

  'Puth carries a Mahabharata-era tradition': entry(
    "Just ahead is Puth, on the banks of the Ganga. Local tradition — and this is tradition, not established history — connects this spot to the Mahabharata era and to King Karna. The district tourism page is clear that this is a local belief passed down over generations, not archaeological proof. Still, it's the kind of story that gives an ordinary riverside village a much older identity in people's minds.",
    'आगे पुठ गांव है, गंगा किनारे बसा हुआ। स्थानीय मान्यता — और यह मान्यता है, प्रमाणित इतिहास नहीं — इसे महाभारत काल और कर्ण से जोड़ती है। जिला पर्यटन पेज साफ कहता है कि यह पीढ़ियों से चली आ रही स्थानीय परंपरा है, पुरातात्विक प्रमाण नहीं। फिर भी, यही कहानी एक सामान्य नदी किनारे के गांव को लोगों के मन में एक बहुत पुरानी पहचान देती है।',
  ),

  'Moradabad sits on the Ramganga': entry(
    "We're now crossing the Ramganga, a tributary of the Ganga. Moradabad, the city ahead, grew right on its banks — the river has been the city's main geographical anchor for centuries.",
    'अब हम रामगंगा नदी पार कर रहे हैं, जो गंगा की एक सहायक नदी है। आगे आने वाला मुरादाबाद शहर इसी नदी के किनारे बसा है — यह नदी सदियों से शहर की भौगोलिक पहचान रही है।',
  ),

  'This region was once a separate kingdom called Rohilkhand': entry(
    "The stretch between Moradabad and Rampur was once its own political territory called Rohilkhand. In the 18th century, as Mughal authority weakened, Afghan chiefs known as Rohillas set up a semi-independent state here. They were eventually defeated in 1774 by a combined British and Nawab-of-Awadh force. Cities like Moradabad, Rampur, and Bareilly still carry that era's imprint — in architecture, Urdu literary traditions, music, and craft. Rampur itself survived afterward as a Rohilla princely state under British protection, and later became home to the Raza Library.",
    'मुरादाबाद और रामपुर के बीच का यह इलाका कभी रोहिलखंड नाम का अपना अलग राजनीतिक क्षेत्र था। 18वीं सदी में जब मुगल सत्ता कमज़ोर पड़ी, अफ़ग़ान रोहिल्ला सरदारों ने यहाँ अर्ध-स्वतंत्र राज्य बनाया, जिसे 1774 में अंग्रेज़ों और अवध के नवाब की संयुक्त सेना ने हराया। मुरादाबाद, रामपुर और बरेली जैसे शहर आज भी उस दौर की छाप रखते हैं — वास्तुकला, उर्दू साहित्य, संगीत और शिल्प में। रामपुर बाद में एक रोहिल्ला रियासत के रूप में अंग्रेज़ी संरक्षण में बचा रहा, और आगे चलकर रज़ा लाइब्रेरी का घर बना।',
  ),

  "You are entering the Terai — one of Asia's richest wildlife corridors": entry(
    "We're entering the Terai now — a narrow belt of flat, moist land running along the base of the Himalayan foothills, from Pakistan all the way to Bhutan. It's known for tall elephant grass, dense riverine forest, and sal trees, and it shelters tigers, leopards, elephants, and one-horned rhinoceros across protected areas like Corbett and Dudhwa. It was once considered nearly impassable because of malaria and thick jungle. Today it's one of Asia's most important wildlife corridors, and conservation here is directly tied to the survival of the tiger in India.",
    'अब हम तराई में प्रवेश कर रहे हैं — हिमालय की तलहटी में फैली एक संकरी, नम पट्टी, जो पाकिस्तान से भूटान तक जाती है। यहाँ लंबी हाथी घास, घने नदी-किनारे के जंगल और साल के पेड़ मिलते हैं, और कॉर्बेट व दुधवा जैसे संरक्षित क्षेत्रों में बाघ, तेंदुआ, हाथी और एक सींग वाला गैंडा पाए जाते हैं। कभी मलेरिया और घने जंगल के कारण यह इलाका लगभग दुर्गम माना जाता था। आज यह एशिया के सबसे महत्वपूर्ण वन्यजीव गलियारों में से एक है, और यहाँ का संरक्षण भारत में बाघों के बचे रहने से सीधे जुड़ा है।',
  ),

  'The flat horizon is ending — the Himalayas are rising ahead': entry(
    "The flat plain we've been crossing for most of this drive is about to change dramatically. Ahead, the Kumaon Himalayas rise sharply — from around 300 metres at the foothills to over 7,000 metres, in a surprisingly short distance. Unlike the flat alluvial plain behind us, this hill belt is still geologically active: the same tectonic collision between the Indian and Eurasian plates that built the Himalayas millions of years ago is still pushing these mountains up by a few millimetres every year.",
    'इस यात्रा में अब तक जो सपाट मैदान हमने पार किया है, वह अब बदलने वाला है। आगे कुमाऊँ हिमालय अचानक ऊँचा उठता है — तलहटी में करीब 300 मीटर से लेकर 7,000 मीटर से ज़्यादा तक, बहुत ही कम दूरी में। हमारे पीछे के सपाट मैदान के उलट, यह पहाड़ी पट्टी आज भी भूगर्भीय रूप से सक्रिय है — भारतीय और यूरेशियाई टेक्टोनिक प्लेटों की वही टक्कर, जिसने लाखों साल पहले हिमालय बनाया, आज भी हर साल पहाड़ों को कुछ मिलीमीटर और ऊँचा कर रही है।',
  ),

  'Nainital is surrounded by seven hills': entry(
    "We've arrived at Nainital, and Uttarakhand Tourism describes it as a town surrounded by seven hills, built around Naini Lake in the Kumaon Himalayas. That bowl-shaped landscape — lake at the centre, hills all around — is what gives Nainital its distinctive setting.",
    'हम नैनीताल पहुँच चुके हैं, और उत्तराखंड पर्यटन के अनुसार यह शहर सात पहाड़ियों से घिरा है, जो कुमाऊँ हिमालय में नैनी झील के चारों ओर बसा है। झील बीच में और चारों ओर पहाड़ियाँ — यही कटोरे जैसी बनावट नैनीताल को उसकी खास पहचान देती है।',
  ),

  "Moradabad is India's Brass City": entry(
    "Here's something you might not expect: Moradabad, the city we're passing, is known internationally as India's Brass City — Peetal Nagri. Skilled local artisans produce brassware, jewellery, and trophies here, and much of it is exported to international markets. It's a genuinely global craft industry, hiding in plain sight along this highway.",
    'एक ऐसी बात जो शायद आपको पता न हो — यह शहर, मुरादाबाद, अंतरराष्ट्रीय स्तर पर पीतल नगरी के नाम से जाना जाता है। यहाँ के कुशल कारीगर पीतल के बर्तन, गहने और ट्रॉफियां बनाते हैं, जिनमें से बड़ा हिस्सा विदेशी बाज़ारों में जाता है। यह हाईवे के किनारे छिपा हुआ, पर सच में वैश्विक स्तर का शिल्प उद्योग है।',
  ),
};
