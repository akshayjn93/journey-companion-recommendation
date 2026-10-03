-- Seed facts are placeholders for architecture testing.
-- Before production/user testing, replace these with human-verified sources.
-- Fixed UUIDs are used so that translations can reference them reliably.

-- ── Content (language-agnostic metadata) ─────────────────────────────────────
INSERT INTO content (id, category, tags, location, interestingness, confidence, source_name, source_url, verified)
VALUES
  ('a0000000-0001-0001-0001-000000000001','history',  ARRAY['hapur','history','highway'],               ST_SetSRID(ST_Point(77.7757,28.7305),4326),6.5,0.70,'PLACEHOLDER — verify before production',NULL,false),
  ('a0000000-0002-0002-0002-000000000002','history',  ARRAY['ganga','canal','history','agriculture'],   ST_SetSRID(ST_Point(78.1700,29.0700),4326),7.8,0.75,'PLACEHOLDER — verify before production',NULL,false),
  ('a0000000-0003-0003-0003-000000000003','culture',  ARRAY['moradabad','brass','craft'],               ST_SetSRID(ST_Point(78.7733,28.8386),4326),8.5,0.80,'PLACEHOLDER — verify before production',NULL,false),
  ('a0000000-0004-0004-0004-000000000004','culture',  ARRAY['rampur','library','history','culture'],    ST_SetSRID(ST_Point(79.0128,28.8006),4326),8.8,0.78,'PLACEHOLDER — verify before production',NULL,false),
  ('a0000000-0005-0005-0005-000000000005','wildlife', ARRAY['corbett','tigers','wildlife','conservation'],ST_SetSRID(ST_Point(79.1300,29.3900),4326),9.2,0.82,'PLACEHOLDER — verify before production',NULL,false),
  ('a0000000-0006-0006-0006-000000000006','geography',ARRAY['haldwani','kumaon','gateway','hills'],     ST_SetSRID(ST_Point(79.5130,29.2183),4326),7.2,0.75,'PLACEHOLDER — verify before production',NULL,false),
  ('a0000000-0007-0007-0007-000000000007','geography',ARRAY['himalayas','foothills','geography'],       ST_SetSRID(ST_Point(79.5000,29.1000),4326),8.2,0.80,'PLACEHOLDER — verify before production',NULL,false),
  ('a0000000-0008-0008-0008-000000000008','geography',ARRAY['nainital','lake','uttarakhand'],           ST_SetSRID(ST_Point(79.4636,29.3919),4326),9.0,0.80,'PLACEHOLDER — verify before production',NULL,false)
ON CONFLICT DO NOTHING;

-- ── English translations (required for every item) ────────────────────────────
INSERT INTO content_translations (content_id, language, title, short_description, narration_hint)
VALUES
  ('a0000000-0001-0001-0001-000000000001','en','Hapur — a crossroads town','Hapur lies at the junction of several NH routes and has historically been a trading waypoint on the road east from Delhi.','Brief note on its role as a trade town; keep under 25 seconds.'),
  ('a0000000-0002-0002-0002-000000000002','en','Ganga canal and the Upper Doab','The Upper Ganges Canal, opened in 1854, transformed irrigation across the Doab region between the Ganga and Yamuna.','Frame as an engineering story — canals visible from or near the route.'),
  ('a0000000-0003-0003-0003-000000000003','en','Moradabad and its brass tradition','Moradabad is widely associated with brassware and metal handicrafts exported worldwide.','Keep this to a 20–30 second cultural fact.'),
  ('a0000000-0004-0004-0004-000000000004','en','Rampur — the Raza Library','Rampur is home to the Raza Library, one of the most significant repositories of Islamic manuscripts in South Asia.','Invite curiosity — mention the scale of the collection and ask if the traveller wants to know more.'),
  ('a0000000-0005-0005-0005-000000000005','en','Jim Corbett and tiger conservation','Corbett National Park, established in 1936, was India''s first national park and is named after the hunter-turned-conservationist Jim Corbett.','Keep the conservation angle; mention the tiger population only as a broad fact.'),
  ('a0000000-0006-0006-0006-000000000006','en','Haldwani — gateway to the hills','Haldwani is the last major plains town before the road climbs into Kumaon; it serves as the main supply base for the hill districts.','Short transition note — mark the shift from plains to hills journey.'),
  ('a0000000-0007-0007-0007-000000000007','en','Entering the Himalayan foothills','The landscape changes significantly as the route approaches the Himalayan foothills near Bhowali.','Explain the transition from plains toward foothills without overclaiming a precise boundary.'),
  ('a0000000-0008-0008-0008-000000000008','en','Nainital lake','Nainital is centred around a natural lake that is a defining feature of the town.','Give a short geography/history teaser and invite the user to ask why the lake is important.'),
  ('a0000000-0009-0009-0009-000000000009','en','Ghaziabad and the older layers of the NCR','The Ghaziabad belt sits on older river and settlement layers, showing how the modern NCR grew on top of older land use and travel routes.','Lead with the idea that this area is older than the present city itself.'),
  ('a0000000-000a-000a-000a-00000000000a','en','Pilkhuwa and the textile corridor','Pilkhuwa is associated with the industrial textile belt that emerged along the road and rail network serving western Uttar Pradesh.','Frame this as a practical industrial story rather than a generic market stop.'),
  ('a0000000-000b-000b-000b-00000000000b','en','Sambhal and the idea of Shambhala','Sambhal is closely linked in Hindu tradition to the mythic Shambhala, a place associated with the arrival of Vishnu''s final avatar.','Use this as a cultural and mythic story with a clear note that it is tradition, not settled fact.'),
  ('a0000000-000c-000c-000c-00000000000c','en','Amroha — a town with manufacturing and market depth','Amroha is known for local industry and a long market-town identity, giving the route a strong sense of the Doab economy.','Keep it grounded in trade and local industry rather than broad claims.'),
  ('a0000000-000d-000d-000d-00000000000d','en','Rudrapur and the agricultural plain','Rudrapur sits in a region shaped by agriculture and transport, marking the switch from the dense Doab corridor to the more open plains of Uttarakhand.','Use this as a transition story between the plains and the hill approach.'),
  ('a0000000-000e-000e-000e-00000000000e','en','Bhowali and the foothill market towns','The Bhowali area marks the first clear shift into Kumaon''s hill ecology, with orchards, roads, and mountain markets.','Explain the change in landscape and everyday life as the route climbs.'),
  ('a0000000-000f-000f-000f-00000000000f','en','The Doab as a road and grain belt','This stretch of western Uttar Pradesh has long been shaped by grain, river routes, and transport corridors connecting Delhi to the north.','Keep this as a landscape and economy note rather than a generic city description.'),
  ('a0000000-0010-0010-0010-000000000010','en','Sambhal and the layered heritage of western UP','Sambhal combines a modern market-town identity with a long, layered historical presence in the Ganga-Yamuna belt.','Use the story to add missing historical texture to the route before the foothill transition.'),
  ('a0000000-0011-0011-0011-000000000011','en','Kashipur and the foothill supply economy','Kashipur sits on the edge of the Himalayan approach, where the route changes from dense plains traffic to hill-linked trade and tourism.','Frame it as an economic and geographic transition point.'),
  ('a0000000-0012-0012-0012-000000000012','en','Bhimtal and the lake-country edge','The Bhimtal and Sattal belt shows how the hill landscape opens into lakes, gardens, and tourism around the Kumaon hills.','Connect this to the stopover feel of the final approach to Nainital.'),
  ('a0000000-0013-0013-0013-000000000013','en','The plains give way to the Himalayan foothills','As the route climbs, the landscape shifts from flat agricultural plains to terraces, steep ridges and cooler air.','Use this to mark the emotional transition into the hill journey.'),
  ('a0000000-0014-0014-0014-000000000014','en','Nainital as a lake-centred hill town','Nainital is defined by its lake and the ring of hills around it, which shaped its identity as a colonial-era hill station and tourism town.','Keep it focused on the lake, the hills, and the town''s distinctive geography.')
ON CONFLICT DO NOTHING;

INSERT INTO content (id, category, tags, location, interestingness, confidence, source_name, source_url, verified)
VALUES
  ('a0000000-0009-0009-0009-000000000009','history', ARRAY['ghaziabad','ncr','ancient-settlement','history'], ST_SetSRID(ST_Point(77.4320,28.6969),4326),8.7,0.88,'Ghaziabad District Administration','https://ghaziabad.nic.in/en/history-of-ghaziabad/',false),
  ('a0000000-000a-000a-000a-00000000000a','industry', ARRAY['pilkhuwa','textile','industry','uttar-pradesh'], ST_SetSRID(ST_Point(77.7000,28.7300),4326),8.4,0.82,'Local industry context','NULL',false),
  ('a0000000-000b-000b-000b-00000000000b','culture', ARRAY['sambhal','shambhala','mythology','hinduism'], ST_SetSRID(ST_Point(78.5700,28.5850),4326),8.9,0.82,'Bhagavata Purana / Wikipedia','https://en.wikipedia.org/wiki/Sambhal',false),
  ('a0000000-000c-000c-000c-00000000000c','industry', ARRAY['amroha','trade','manufacturing','market'], ST_SetSRID(ST_Point(78.4550,28.9000),4326),8.1,0.80,'Regional trade context','NULL',false),
  ('a0000000-000d-000d-000d-00000000000d','geography', ARRAY['rudrapur','agriculture','plain','uttarakhand'], ST_SetSRID(ST_Point(79.4050,28.9910),4326),7.8,0.78,'Regional geography context','NULL',false),
  ('a0000000-000e-000e-000e-00000000000e','geography', ARRAY['bhowali','foothills','kumaon','orchards'], ST_SetSRID(ST_Point(79.5170,29.2700),4326),8.3,0.80,'Uttarakhand tourism context','NULL',false),
  ('a0000000-000f-000f-000f-00000000000f','history', ARRAY['doab','grain','transport','trade'], ST_SetSRID(ST_Point(78.2000,28.9200),4326),7.9,0.76,'Regional route history','NULL',false),
  ('a0000000-0010-0010-0010-000000000010','history', ARRAY['sambhal','western-up','heritage','market'], ST_SetSRID(ST_Point(78.5700,28.5850),4326),7.9,0.76,'Regional heritage context','NULL',false),
  ('a0000000-0011-0011-0011-000000000011','geography', ARRAY['kashipur','supply','foothills','trade'], ST_SetSRID(ST_Point(78.9610,29.2140),4326),7.9,0.76,'Regional transport context','NULL',false),
  ('a0000000-0012-0012-0012-000000000012','geography', ARRAY['bhimtal','lake','kumaon','tourism'], ST_SetSRID(ST_Point(79.5640,29.3470),4326),8.2,0.79,'Uttarakhand tourism context','NULL',false),
  ('a0000000-0013-0013-0013-000000000013','geography', ARRAY['foothills','himalayas','transition','landscape'], ST_SetSRID(ST_Point(79.4800,29.1800),4326),8.5,0.82,'Regional landscape context','NULL',false),
  ('a0000000-0014-0014-0014-000000000014','places', ARRAY['nainital','lake','hill-station','tourism'], ST_SetSRID(ST_Point(79.4636,29.3919),4326),8.8,0.82,'District Nainital, Government of Uttarakhand','https://nainital.nic.in/',false)
ON CONFLICT DO NOTHING;

-- ── Hindi translations (sample — expand as translations are verified) ─────────
INSERT INTO content_translations (content_id, language, title, short_description, narration_hint)
VALUES
  ('a0000000-0003-0003-0003-000000000003','hi','मुरादाबाद और उसकी पीतल परंपरा','मुरादाबाद पीतल के बर्तनों और धातु शिल्प के लिए दुनियाभर में प्रसिद्ध है।','20–30 सेकंड की एक सांस्कृतिक जानकारी दें।'),
  ('a0000000-0005-0005-0005-000000000005','hi','जिम कॉर्बेट और बाघ संरक्षण','कॉर्बेट नेशनल पार्क 1936 में स्थापित हुआ था और यह भारत का पहला राष्ट्रीय उद्यान है।','संरक्षण के पहलू पर ध्यान दें; बाघों की संख्या केवल सामान्य तथ्य के रूप में बताएं।'),
  ('a0000000-0008-0008-0008-000000000008','hi','नैनीताल झील','नैनीताल एक प्राकृतिक झील के इर्द-गिर्द बसा है जो इस शहर की पहचान है।','एक संक्षिप्त भूगोल और इतिहास की झलक दें और यात्री को और जानने के लिए आमंत्रित करें।')
ON CONFLICT DO NOTHING;
