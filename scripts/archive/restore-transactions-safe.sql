-- Restore transactions from Oct 28 backup
-- This script safely inserts missing transactions
-- Generated: 2025-10-31T01:42:59.863Z

-- Step 1: Backup current transactions
CREATE TABLE IF NOT EXISTS transactions_backup_before_restore_20251031 AS 
SELECT * FROM transactions;

-- Step 2: Insert missing transactions (ON CONFLICT DO NOTHING to preserve current data)

INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '562de0a7-9824-430f-9a7b-d1b40b97afea',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'deposit',
  1000,
  'pending',
  '8caefcc2fc3852349418e6972ee3f95c166a16da14ac1c044a99e28f64668c51',
  'lnbc10u1p5qan9fpp53jh0eshu8pfrf9qcu6tjacletstx59k6zjkpcpz2n83g7erx33gsdp0g3jhqmmnd96zqvfsxqczqumpw3ejqar0yprkzmnpd4hhxggcqzzsxqrrsssp5dfw09awh20gyqnzu2rkjsm5crrrd4a42nj4dg930kt7dju4x8klq9qxpqysgql3kp8j3dgq02949t6rjv42kq43m7w5k6hs6j4ajks5sjk062wd2qywfhzde34umqt7nerusvuzrpu5p0nn9mtl4nfhavywfwjyuxvuqqv5heg4',
  NULL,
  'Deposit 1000 sats to Ganamos!',
  '2025-04-28 00:32:42.022762+00',
  '2025-04-28 00:32:42.022762+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '8b51ab0a-ad83-4f15-93be-366af4bc48e2',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'deposit',
  1000,
  'pending',
  'e5138ad587af5fd0efba512190a96baf71d30b1082f5fa141b2bc4d41c8820bc',
  'lnbc10u1p5qank9pp5u5fc44v84a0apma62ysep2tt4acaxzcsst6l59qm90zdg8ygyz7qdp0g3jhqmmnd96zqvfsxqczqumpw3ejqar0yprkzmnpd4hhxggcqzzsxqrrsssp5rtp4n9hyslwtpvjxz0vtg55zdzk5c3xwtz4utus4el20g67nv34q9qxpqysgq59qx4s364zakezlq5wregtuvkur8letlacyqwrjscakgk79739gsvu9nwuc2yjp6kl6v7cncr2y6p2arqtz7gj93hctnfv0jqd7rjdqqhqtegu',
  NULL,
  'Deposit 1000 sats to Ganamos!',
  '2025-04-28 00:41:41.785176+00',
  '2025-04-28 00:41:41.785176+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '58e85716-6d39-4aeb-a1f7-3b0ff39ece9c',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'deposit',
  1000,
  'pending',
  '421b7e8cf5f4ea5030992b5376170ba50b7a95f415c479bfbb73e8725b64c571',
  'lnbc10u1p5qan6qpp5ggdhar847n49qvye9dfhv9ct559h4905zhz8n0amw058ykmyc4csdp0g3jhqmmnd96zqvfsxqczqumpw3ejqar0yprkzmnpd4hhxggcqzzsxqrrsssp5d9cqld6c8hnx3t0m4jzphe7uj602kuvzkyge2fyeu7dpccgjrnls9qxpqysgqqmwzdp85x5p3l40n5wgglppszkpyg5jx67jm0r5jmn3wvp3g530yrc4wwg4vwuqaj5crgxuxzth6gt29dls842dtt5q6dzdt40lhesgpkev543',
  NULL,
  'Deposit 1000 sats to Ganamos!',
  '2025-04-28 00:43:45.273293+00',
  '2025-04-28 00:43:45.273293+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  'fac0281d-0058-4138-a432-94a37cbe072f',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'deposit',
  1000,
  'pending',
  'a9056412bc4fe7c8b46fa7ecf8b500c96517a4848a2c16754f16bd5f0204e8e7',
  'lnbc10u1p5qan6dpp54yzkgy4uflnu3dr05lk03dgqe9j30fyy3gkpva20z6747qsyarnsdp0g3jhqmmnd96zqvfsxqczqumpw3ejqar0yprkzmnpd4hhxggcqzzsxqrrsssp5sjfqyawhdxms2hzcc437td92532kczh780fsrqnsj8hnytffp9kq9qxpqysgq2ugt4ar4nzj0yuq8w7jynftevr0kwzusnksd6w752vgs6w8huk4y0pkcxlsy3vlakmamaj8cdfdyecefym9u5jvutzvvwrh0hcyw77gq0nj5jt',
  NULL,
  'Deposit 1000 sats to Ganamos!',
  '2025-04-28 00:43:58.122853+00',
  '2025-04-28 00:43:58.122853+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '76efd3c1-fd9d-40cf-926c-9ee861da9300',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'deposit',
  1000,
  'completed',
  'a397886f2d98f36960f8a8ef80cac970cc2ee206daa2ee45cfcaf2750ea9e6fb',
  'lnbc10u1p5p5wn3pp55wtcsmednrekjc8c4rhcpjkfwrxzacsxm23wu3w0ete82r4fumasdp0g3jhqmmnd96zqvfsxqczqumpw3ejqar0yprkzmnpd4hhxggcqzzsxqrrsssp5lazjdv7rljyz2y6ad4x0dl2xape5kqrxrlu8xdmnjughvjr7vvaq9qxpqysgqa6y7a76xh7qexhszrmnt8fm4zneqvqnnd8p3755ukkkcs3h2sxshhdf8edtrdymfz22z3kqefu39zex4yknt43xks4f5h64jm9fee8sph68nl0',
  NULL,
  'Deposit 1000 sats to Ganamos!',
  '2025-05-06 16:36:01.441433+00',
  '2025-05-06 16:36:22.951+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  'aa07b650-6e14-4a8f-8e5e-b7b449f32313',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'deposit',
  1000,
  'completed',
  '426531f0f6f873a493b8599096f323e8ef0d5796c733e266627486c4e4c590d2',
  'lnbc10u1p5p5wkupp5gfjnru8klpe6fyactxgfduerarhs64ukcue7yenzwjrvfex9jrfqdp0g3jhqmmnd96zqvfsxqczqumpw3ejqar0yprkzmnpd4hhxggcqzzsxqrrsssp5rjhfua0hqwa78cz540w40aa0x0g24dglcy95mwxs7s4gr02gmyfs9qxpqysgqdng8p7pel3lgz306un97e4apczwfazrwy23k8xk3l84gtck92sjsldsfxgase64pt7p3gjtqrmd08ftz4aczkw6u2g7x0hm2tauvatsqv7vv7y',
  NULL,
  'Deposit 1000 sats to Ganamos!',
  '2025-05-06 16:37:48.881837+00',
  '2025-05-06 16:38:13.346+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '05448b0a-04f8-4804-bfea-64ecd11479a9',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'deposit',
  1000,
  'pending',
  '0bf7634731a8bc9be675d31013ec2bd16fe44a95a6f2f8d78dc8954ab28138b2',
  'lnbc10u1p5p5sptpp5p0mkx3e34z7fhen46vgp8mpt69h7gj545me034udez254v5p8zeqdp0g3jhqmmnd96zqvfsxqczqumpw3ejqar0yprkzmnpd4hhxggcqzzsxqrrsssp5uzz7phgsw94qkjh94uvcjs3erjean6vaz55h9yxgsy3xx9r9q5rs9qxpqysgqjcceqyh8f973yxnmwdmck8y0h8w32g4fguakamlrg2x6ydzkhsfssap66ags8hd3mnaqjs9dscmrs3xfarestvkphjalw6jekrgykcqpt3yl6x',
  NULL,
  'Deposit 1000 sats to Ganamos!',
  '2025-05-06 17:00:27.857352+00',
  '2025-05-06 17:00:27.857352+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '9094fdd6-2ae9-44c6-a88a-16036909b381',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'deposit',
  1000,
  'completed',
  '5de5c7ac9dfdad2ebd569f2cc26f23dc26ba212997f922ac321d590144136e4b',
  'lnbc10u1p5phvprpp5thju0tyalkkja02knukvymermsnt5gffjluj9tpjr4vsz3qnde9sdp0g3jhqmmnd96zqvfsxqczqumpw3ejqar0yprkzmnpd4hhxggcqzzsxqrrsssp5yjgvzu56g65tpkjf5qfskes3txqjpau5pmrwmw3fkrgjpqthqhlq9qxpqysgqkp0lm05zpg8vxqfyd64dtvn37e9h99jqlsk0w9lxa04y4vl6asw5el2dst9vwhjf9f2qt707ay806g46cwr9z6twcvs05cmzlmh4utgpjwvqhr',
  NULL,
  'Deposit 1000 sats to Ganamos!',
  '2025-05-07 19:10:29.41875+00',
  '2025-05-07 19:11:10.152+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  'f2905ef3-e5d2-46aa-8c84-e2c50363a61e',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'deposit',
  1000,
  'pending',
  '4028f2916b5504dca2ae4202b9fa1472fca3f97ae4600b5f115e89a8d2822203',
  'lnbc10u1p5zdqk2pp5gq509ytt25zdeg4wggptn7s5wt7287t6u3sqkhc3t6y6355zygpsdp0g3jhqmmnd96zqvfsxqczqumpw3ejqar0yprkzmnpd4hhxggcqzzsxqrrsssp5rssehqh0h5az5f39retl95lnsvxtngmztr9lzs9pz0dpus8977vs9qxpqysgq342xuwuzceay9zrh6j962cga0rv0g25ktsgltgetee4wwyuv3cxn6cz6zkvfgzg8vcemur5ye6rett64am2jcth0uwqnqvpt9w9vzugqy40x6p',
  NULL,
  'Deposit 1000 sats to Ganamos!',
  '2025-05-16 00:11:55.227146+00',
  '2025-05-16 00:11:55.227146+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '4adf0b61-177b-4ec1-8be7-ab2e48421ff1',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'deposit',
  1000,
  'completed',
  '3e4885c98ea7eb8b9290bc92e95a0cec0686ea6234845a7c68551c7d9dfe3429',
  'lnbc10u1p5zdq76pp58eygtjvw5l4chy5shjfwjksvasrgd6nzxjz95lrg25w8m807xs5sdp0g3jhqmmnd96zqvfsxqczqumpw3ejqar0yprkzmnpd4hhxggcqzzsxqrrsssp5qsv7rsldmlg75y33u3z5x4kz0rd8nc8sdwmvdg8yfmx6u0f8de0s9qxpqysgqn0xaegjwnn4ja7sz7l8dsqwsx5hv9ez2p2l3h4sentcgx87uyqt5kstvsmzdjgrtgaz4m0ltwa8fmrx8yzrl67pkh7ypgx3fzyuzkjqpc95wr6',
  NULL,
  'Deposit 1000 sats to Ganamos!',
  '2025-05-16 00:16:26.633461+00',
  '2025-05-16 00:16:51.871+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '89a66649-eb38-4d21-b8f3-9b4b35ff9c61',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'deposit',
  1000,
  'pending',
  '21a3bb7004aa67aead81ca5ee343615f52e7f9884c96c3f87e778b0a56806344',
  'lnbc10u1p5zdptvpp5yx3mkuqy4fn6atvpef0wxsmptafw07vgfjtv87r7w79s545qvdzqdp0g3jhqmmnd96zqvfsxqczqumpw3ejqar0yprkzmnpd4hhxggcqzzsxqrrsssp5y9dl5w7adkqty5u9ukugejqmzrd3afq50t39s4suycm20wf3hpas9qxpqysgqf5ss8yjl6x86sqh8j45mjcp9yh7rflpzxapsvmfgtkawqtxvxz3hyz54fln80vd2v7x2rqxnljlts4k4awl5q4s53265xhlsenpkflgpnwuy7s',
  NULL,
  'Deposit 1000 sats to Ganamos!',
  '2025-05-16 00:23:09.253436+00',
  '2025-05-16 00:23:09.253436+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '9e48a725-a586-42ee-9c35-ae68965ca2db',
  'ce210e13-15c9-467b-b86e-6768dbdc3bca',
  'deposit',
  1000,
  'completed',
  '0c2f11ba72bcd1f6a4b82ec6886676db65776e4817c6f9a8fd3987984dd30894',
  'lnbc10u1p5zdvdjpp5psh3rwnjhngldf9c9mrgsenkmdjhwmjgzlr0n28a8xresnwnpz2qdp0g3jhqmmnd96zqvfsxqczqumpw3ejqar0yprkzmnpd4hhxggcqzzsxqrrsssp5j7jhwegrceef0nw9q7a9u0v3wdvkk86crw3ara3zlxr0rchgwk3q9qxpqysgq467pzwgdzgce9fewh0pkn8px009sc8563vm6vss7mtwz7uza3r9sukgeeqjm5ud2lg7zv84frqzvqgz6g4d3rvq465xren8lwdsn8fgqz4xjn8',
  NULL,
  'Deposit 1000 sats to Ganamos!',
  '2025-05-16 03:32:02.288404+00',
  '2025-05-16 03:32:27.338+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  'f7b1fae6-120a-43ba-88cc-215811352877',
  'ce210e13-15c9-467b-b86e-6768dbdc3bca',
  'deposit',
  1000,
  'completed',
  '95f61742580f488d604764e5d4f7e11adf3779bf85d3624f7ac77c417be205fe',
  'lnbc10u1p5zdvjqpp5jhmpwsjcpayg6cz8vnjafalprt0nw7dlshfkynm6ca7yz7lzqhlqdp0g3jhqmmnd96zqvfsxqczqumpw3ejqar0yprkzmnpd4hhxggcqzzsxqrrsssp54hc3f39mupwnep9dmdp9pe7jhlcd89dkfmmql7qxmx5yu7943yzq9qxpqysgqhexpcvh8vy2g2ng5k6yku5svuh23mly4a85nymywp5dhrc9uhwfrj05rmsx5fzkeuhuvuwu7pf990xfhfne9zgytftn0pn23hmlev0qq9dy3dk',
  NULL,
  'Deposit 1000 sats to Ganamos!',
  '2025-05-16 03:34:24.68564+00',
  '2025-05-16 03:34:34.632+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '575bf97f-5c4f-41e0-bcae-49aa7082af6e',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'deposit',
  1000,
  'completed',
  '97b935fd891b98f14c2e1090464becdc315990ba823f325347572dad33d17262',
  'lnbc10u1p5zde0jpp5j7untlvfrwv0znpwzzgyvjlvmsc4ny96sglny5682uk66v73wf3qdp0g3jhqmmnd96zqvfsxqczqumpw3ejqar0yprkzmnpd4hhxggcqzzsxqrrsssp56e5zqy89typ57y3256kq7g0xhfsv30e2ah0uzgd46r9lczxu2tws9qxpqysgqh6kug5dys4fu5k5ecsdll4tdufg4z8ykscjlr7c7aq09zp37xf73fwmvgrcwykae6gmdrpr056es9snjpdeqlledykpczjsd3j04afcqqckyq0',
  NULL,
  'Deposit 1000 sats to Ganamos!',
  '2025-05-16 07:14:58.41193+00',
  '2025-05-16 07:15:24.04+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '88370702-ec4a-45aa-abfb-25f2eef0067a',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'internal',
  3000,
  'completed',
  NULL,
  NULL,
  NULL,
  'Transfer from @Annie: love you',
  '2025-10-01 08:28:48.768324+00',
  '2025-10-01 08:28:48.768324+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '2e4b00b9-8841-4159-8093-0bdbca92338f',
  'ce210e13-15c9-467b-b86e-6768dbdc3bca',
  'internal',
  -1000,
  'completed',
  NULL,
  NULL,
  NULL,
  'Transfer to @brian-murray',
  '2025-10-05 19:53:51.221535+00',
  '2025-10-05 19:53:51.221535+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  'd52622b5-048b-44a8-ab18-56e7c8d4f132',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'internal',
  1000,
  'completed',
  NULL,
  NULL,
  NULL,
  'Transfer from @Annie',
  '2025-10-05 19:53:51.221535+00',
  '2025-10-05 19:53:51.221535+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '44bef11c-2dc9-4f1d-9961-9c57b88e0033',
  'ce210e13-15c9-467b-b86e-6768dbdc3bca',
  'internal',
  -300,
  'completed',
  NULL,
  NULL,
  NULL,
  'Transfer to @brian-murray: hi stark!',
  '2025-10-09 16:54:44.56084+00',
  '2025-10-09 16:54:44.56084+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '5fb37117-52d3-404c-8080-a6cd45388924',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'internal',
  300,
  'completed',
  NULL,
  NULL,
  NULL,
  'Transfer from @Annie: hi stark!',
  '2025-10-09 16:54:44.56084+00',
  '2025-10-09 16:54:44.56084+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '2889e218-74fd-4d3d-b999-0dc6263bbf30',
  'ce210e13-15c9-467b-b86e-6768dbdc3bca',
  'internal',
  -300,
  'completed',
  NULL,
  NULL,
  NULL,
  'Transfer to @brian-murray: Coco?',
  '2025-10-12 19:36:56.010362+00',
  '2025-10-12 19:36:56.010362+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '8fbcc227-17c6-4815-bb89-e0cf064d6310',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'deposit',
  1000,
  'completed',
  '7a190d75c8bdc978cbc990ebc4d33b45047d20835ef799851f6510cc516f5855',
  'lnbc10u1p5zd6ygpp50gvs6awghhyh3j7fjr4uf5emg5z86gyrtmmenpglv5gvc5t0tp2sdp0g3jhqmmnd96zqvfsxqczqumpw3ejqar0yprkzmnpd4hhxggcqzzsxqrrsssp5992cmklylkul65pgzvvnz5x47ucl3eqm3exjxqfm2dgxudvk32fs9qxpqysgque7ta40rnuknrecq0qczznfcfkmq32muncg96jvt3ljcgewyy8tjcgt04p4ustt4p7sfckfkzc9n6grrf0rne94g860d7tm62afneugpzv2ltp',
  NULL,
  'Deposit 1000 sats to Ganamos!',
  '2025-05-16 07:26:00.552541+00',
  '2025-05-16 07:26:19.965+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '42d0daf9-2029-4821-a18b-fa5f1939bfa7',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'deposit',
  1000,
  'completed',
  '39e32794b9593e616ae22707509c7f7b654dde1ae11827bcf17e8d8d7dd5983d',
  'lnbc10u1p5zd64fpp5883j099etylxz6hzyur4p8rl0dj5mhs6uyvz008306xc6lw4nq7sdp0g3jhqmmnd96zqvfsxqczqumpw3ejqar0yprkzmnpd4hhxggcqzzsxqrrsssp503mru8y0jwdzu942uqf46zw8vawk4y06ekvsmmrqpjq0hchvgp6s9qxpqysgqkffs6mh855h48qf5rsnl5j9uf4mv2tps3qs4f27urgz6svpryjppnncj65zjtqy8ph76hmnq2a6sxtxkndguphlz30llufrcf9mr53spxk2ztu',
  NULL,
  'Deposit 1000 sats to Ganamos!',
  '2025-05-16 07:35:06.154336+00',
  '2025-05-16 07:35:22.163+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '4dfcc766-0723-421d-aa6b-3145eebedbad',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'deposit',
  1000,
  'completed',
  '7a51941153a000404c765c2d2e32157f51fff8186f449994f3d3497974942d03',
  'lnbc10u1p5zd6kfpp50fgegy2n5qqyqnrktskjuvs40agll7qcdazfn98n6dyhjay595psdp0g3jhqmmnd96zqvfsxqczqumpw3ejqar0yprkzmnpd4hhxggcqzzsxqrrsssp5tfa99wfhqtmap9hknq3tuj6wl9pr6g96tw4qq8m8hhf5zs6s4wdq9qxpqysgq9y28t7tmegp5u3zmn9x8m8mvtw9rm2xjwr2zmqq35vee7g5vnwd3gs2r327tmmmwczz068t82fk2fk72ex02ufwp3l0r7kylfdtwtfqp00trdt',
  NULL,
  'Deposit 1000 sats to Ganamos!',
  '2025-05-16 07:35:38.111414+00',
  '2025-05-16 07:35:51.326+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '8de22768-4bf6-40f6-9b1c-b6998fafa7f5',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'deposit',
  1000,
  'completed',
  '5d627b3976c228e1bb6f53d7007c70ee7934bc959f2f913a458ebc96efd839bf',
  'lnbc10u1p5zdmyhpp5t438kwtkcg5wrwm020tsqlrsaeunf0y4nuhezwj9367fdm7c8xlsdp0g3jhqmmnd96zqvfsxqczqumpw3ejqar0yprkzmnpd4hhxggcqzzsxqrrsssp5spdv2y4v06f02a9n0sle4nh9em79rzasqt4lcetpu9dflt86ps4s9qxpqysgqkd0sv76sdn5zv7236kypus2agfeqp9hupx27ygu72nkgc2zxwc5jy9yww5hxhvj9v9fwvupqxjg97szvw9438wettt9l4sjzxlsvt3gpx0nz2j',
  NULL,
  'Deposit 1000 sats to Ganamos!',
  '2025-05-16 07:43:20.156667+00',
  '2025-05-16 07:43:38.919+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  'cde7392f-0ecf-437b-afdc-0957568646cb',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'deposit',
  1000,
  'completed',
  '3da4f1f515af89984c74e7c923866a19482234893c196b996ca9a52dfe3707f7',
  'lnbc10u1p5zdm8dpp58kj0rag447yesnr5ulyj8pn2r9yzydyf8svkhxtv4xjjml3hqlmsdp0g3jhqmmnd96zqvfsxqczqumpw3ejqar0yprkzmnpd4hhxggcqzzsxqrrsssp5x9gchqe9vzqv6uffvul5nf42tpzxcpvz3hmsv533wgt9wwf3glgs9qxpqysgqag2qx5h2p4jtwxae3lyalych6tf9k5kt6dz43fhe4ptz9xumeqgx8qxfy8uuatqwqer9qt7nzr95hdu8w7s7jl90lk0322yfrsjrnqqp7cccja',
  NULL,
  'Deposit 1000 sats to Ganamos!',
  '2025-05-16 07:44:45.61254+00',
  '2025-05-16 07:45:01.474+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '69323102-1507-4e7b-b549-bfe411053a4f',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'deposit',
  20000,
  'completed',
  'd05078e65a225e68607ea7669852d57b70121aaf740a16d326aaaf561fec9b94',
  'lnbc200u1p5z34jwpp56pg83ej6yf0xscr75anfs5k40dcpyx40ws9pd5ex42h4v8lvnw2qdpsg3jhqmmnd96zqv3sxqcrqgrnv968xgr5dusywctwv9kk7uepcqzzsxqrrsssp5fdu4h9aldtx8g7u2qpxcwer3j9lk82s9g3gapmhn7l5wlfeqwlqs9qxpqysgqzhqd2sf937tmgu3eez0mhzxgpxpqkk6fd87twvywk2vuvfs569ykp8ef3vpwy0h62pnncxugzx9y7xrllz0cwh940dhv4j6228vhzucq655e09',
  NULL,
  'Deposit 20000 sats to Ganamos!',
  '2025-05-17 18:32:46.715318+00',
  '2025-05-17 18:33:29.045+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '0969faa3-36b5-4cf6-89aa-80f8e413a245',
  'ce210e13-15c9-467b-b86e-6768dbdc3bca',
  'deposit',
  10000,
  'completed',
  '8af1d1e14e33932b7a6160478945eb2166564de9131c5191c5cad2e96038d728',
  'lnbc100u1p5rpkx6pp53tcarc2wxwfjk7npvprcj30ty9n9vn0fzvw9ryw9etfwjcpc6u5qdpsg3jhqmmnd96zqvfsxqcrqgrnv968xgr5dusywctwv9kk7uepcqzzsxqrrsssp58r48wanwj8zlul6rk8e46h2gut54h3hz9qrsj2ld4twe9jpsxwgq9qxpqysgqks8wcafcm537zsaal0p5xs8wk3mwpzxu3qwf5sngmsl5ctp63pgk2sky0htq3yzp3w5xlkqhclens7gmm5gseak9qwtezp6fy79xk7qp29d39x',
  NULL,
  'Deposit 10000 sats to Ganamos!',
  '2025-05-23 20:21:47.222455+00',
  '2025-05-23 20:22:06.192+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '609b6e14-ac20-40e0-a3cc-2d80feaaffb8',
  '4263532e-e3c1-4b06-9b07-cbe32987157b',
  'deposit',
  1000,
  'pending',
  '34e597a6e869c7e06e8ff0c40828169312d3b9aedf390679a98897a435409318',
  'lnbc10u1p5rydc9pp5xnje0fhgd8r7qm507rzqs2qkjvfd8wdwmuusv7df3zt6gd2qjvvqdp0g3jhqmmnd96zqvfsxqczqumpw3ejqar0yprkzmnpd4hhxggcqzzsxqrrsssp5z6avgcrwrrnzpa223cwalaun4xmu2aruwrw55h74dhmctfpy0mws9qxpqysgq6j442nsyejmyn0rnej4ss83wgh4chuhgjtr2ks74gngsehuw3lxqd248p7ta8mv8fce46yenwrqfxr7fnf7dztssel9l69fgx9teq9gpwus887',
  NULL,
  'Deposit 1000 sats to Ganamos!',
  '2025-05-24 21:15:49.577563+00',
  '2025-05-24 21:15:49.577563+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '80e11600-9952-4d9e-a5ab-5a2b4ffe82ce',
  'd60a269f-b1a9-4030-96d5-7ddc3ca5e369',
  'deposit',
  6000,
  'completed',
  '3e67dd1f3f6fe5a8fa37e07d3e0b9765ae619bc77d977e0165ec528dbd76352e',
  'lnbc60u1p5ry3l0pp58ena68eldlj6373hup7nuzuhvkhxrx780kthuqt9a3fgm0tkx5hqdp0g3jhqmmnd96zqd3sxqczqumpw3ejqar0yprkzmnpd4hhxggcqzzsxqrrsssp53x6aumyqlyq3ty3rtlrqjc3w0g8mhxhmcv08qgwwjr95s43n7ews9qxpqysgq47gdvuns274ackn0sf2ptlktfljcy55m9773vzenweayqsp87n5n633uuah4l9xeyxpunadgq8ydwrq9qv02kavx6u0laxhlfll9j3qp2stm2c',
  NULL,
  'Deposit 6000 sats to Ganamos!',
  '2025-05-24 22:27:59.407797+00',
  '2025-05-24 22:28:27.654+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '451e0c7c-6143-494c-8297-1b8712b2ff46',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'deposit',
  10000,
  'pending',
  'e817da8804535a362120f508e2febc7eaf4b9b7352e489c3a9a76c7ffb7cf05c',
  'lnbc100u1p5rv6uhpp5aqta4zqy2ddrvgfq75yw9l4u06h5hxmn2tjgnsaf5ak8l7mu7pwqdpsg3jhqmmnd96zqvfsxqcrqgrnv968xgr5dusywctwv9kk7uepcqzzsxqrrsssp5tagqgm0yggpr4ha0axmeyndyvyucp5dul0kmzk79h9y4lxwul5yq9qxpqysgqgvs0973yxzk79yyqdgcm0wrvzuqugadtaza2932ysrvz7qx0jw0ssvmegf9d6hhl8wkq57m5uy6g5q0gzdcvwtswkmxv0rw3fys368qpd0cpek',
  NULL,
  'Deposit 10000 sats to Ganamos!',
  '2025-05-28 01:49:11.871548+00',
  '2025-05-28 01:49:11.871548+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '98167509-274a-4ad2-a9db-256657ae83a0',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'deposit',
  10000,
  'completed',
  '2ac48ba997348013834aebdfab0df77725bfdddf174514333fa9617110f0a43b',
  'lnbc100u1p5rdvhupp59tzgh2vhxjqp8q62a006kr0hwujmlhwlzaz3gvel49shzy8s5sasdpsg3jhqmmnd96zqvfsxqcrqgrnv968xgr5dusywctwv9kk7uepcqzzsxqrrsssp5mj8g2wutu4v2x45tqw9jpzzqfhnx0y5dx40snnpw6xu0d2u5cyps9qxpqysgqg5h9350zu7f7fqgnytlxxslae8uev2e58xr3h9f6e6fnuu2uwu9rsckg93s8zhwwqadfjhrqtlz82x82lucndt46z35dqtupuszsd3qp4mj6ef',
  NULL,
  'Deposit 10000 sats to Ganamos!',
  '2025-05-28 06:53:48.632555+00',
  '2025-05-28 06:54:23.24+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '65dd4667-d4dd-48dc-8ddc-4c6005f42c4f',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'deposit',
  1000,
  'completed',
  'dcfe37769b0a4258f2873a3421d2473108c495a533f05166f812b78bc4e3f92b',
  'lnbc10u1p5rjdgvpp5mnlrwa5mpfp93u588g6zr5j8xyyvf9d9x0c9zehcz2mch38rly4sdp0g3jhqmmnd96zqvfsxqczqumpw3ejqar0yprkzmnpd4hhxggcqzzsxqrrsssp5u3q73ratleczg0guh542ky6836a6dhd2s45qercyqm7r72nyuzgq9qxpqysgqv5lem5vecnjh0a77hku5ttgdlv6znl9g5p88vugxwwf2algwpqykz4llx30ns5phz26m649rcu9ca6vqnpt9hren9jslux0j4p9akhcpdttc73',
  NULL,
  'Deposit 1000 sats to Ganamos!',
  '2025-05-30 04:33:17.184216+00',
  '2025-05-30 04:34:24.082+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  'f6c6206d-e368-4304-b967-f6f77baa0763',
  '17318219-9c30-466c-a17a-d9ead345b933',
  'deposit',
  20000,
  'pending',
  '8e37b2952e3fad6d346994c99cd267639b31e85a79904a00b0934b1d133d72ca',
  'lnbc200u1p5yrqerpp53cmm99fw87kk6drfjnyee5n8vwdnr6z60xgy5q9sjd936yeawt9qdpsg3jhqmmnd96zqv3sxqcrqgrnv968xgr5dusywctwv9kk7uepcqzzsxqrrsssp5w8vtf30umy2fqq378vgq2mmrfzga770ukpygv87u9ytv37h0qg9s9qxpqysgqtqrtyugtslc5ean8aaq7lyh0y2npl74jmueu2z5wcawx6ju3upprmqncn5u82wuu72jrgmnzdqc5fp5czmut44fhgqjla7e978qgsegqm8utv5',
  NULL,
  'Deposit 20000 sats to Ganamos!',
  '2025-06-05 11:44:35.525804+00',
  '2025-06-05 11:44:35.525804+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  'ff1cb306-9c09-4590-b292-cd56993fe097',
  'a6c07129-6f99-4bdd-ba12-b1756f681af6',
  'deposit',
  1000,
  'pending',
  'ed77e30ba432745d1344b82284e8ef24b3346f1f4601d8ce43c9e99813f24878',
  'lnbc10u1p5ysf6zpp5a4m7xzayxf696y6yhq3gf680yjengmclgcqa3njre85esyljfpuqdp0g3jhqmmnd96zqvfsxqczqumpw3ejqar0yprkzmnpd4hhxggcqzzsxqrrsssp5c6s2tk4d3yw6u3htrgmy4cm9mjy8netf7gcll9ratzjhymh8l8zs9qxpqysgqcx0y6qjag7x7ln3427nt2c4rvzeagztl6pfaly008kwtze87wxukt73uugspxdgva8r5ltta9kadumnujza3l0smns9ashyp78gu7pqqjplymx',
  NULL,
  'Deposit 1000 sats to Ganamos!',
  '2025-06-10 12:38:27.237467+00',
  '2025-06-10 12:38:27.237467+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '84fd4443-97ca-4cd8-abbd-6259ba18c993',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'internal',
  -333,
  'completed',
  NULL,
  NULL,
  NULL,
  'Transfer to Annie: because i love you',
  '2025-10-03 04:34:22.409051+00',
  '2025-10-03 04:34:22.409051+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '00184c30-31c3-4170-939a-4b0e6246091c',
  'ce210e13-15c9-467b-b86e-6768dbdc3bca',
  'internal',
  333,
  'completed',
  NULL,
  NULL,
  NULL,
  'Transfer from Brian: because i love you',
  '2025-10-03 04:34:22.409051+00',
  '2025-10-03 04:34:22.409051+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '46ed653b-1ff6-4ded-affc-0e7e91eb8eb9',
  'ce210e13-15c9-467b-b86e-6768dbdc3bca',
  'internal',
  -500,
  'completed',
  NULL,
  NULL,
  NULL,
  'Transfer to @brian-murray',
  '2025-10-05 19:59:53.15868+00',
  '2025-10-05 19:59:53.15868+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '449100fb-035f-4720-a152-2fc283e0fb8a',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'internal',
  500,
  'completed',
  NULL,
  NULL,
  NULL,
  'Transfer from @Annie',
  '2025-10-05 19:59:53.15868+00',
  '2025-10-05 19:59:53.15868+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  'c339ba15-d381-42db-91c2-46063b0bf2e2',
  'ce210e13-15c9-467b-b86e-6768dbdc3bca',
  'internal',
  -333,
  'completed',
  NULL,
  NULL,
  NULL,
  'Transfer to @brian-murray: hi stark!',
  '2025-10-09 17:34:23.979973+00',
  '2025-10-09 17:34:23.979973+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  'bb803141-f7a8-4936-a3a9-a70ee0bb2772',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'internal',
  333,
  'completed',
  NULL,
  NULL,
  NULL,
  'Transfer from @Annie: hi stark!',
  '2025-10-09 17:34:23.979973+00',
  '2025-10-09 17:34:23.979973+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '06d524c5-eb61-4a50-be1d-38132d03175d',
  'ce210e13-15c9-467b-b86e-6768dbdc3bca',
  'deposit',
  10000,
  'completed',
  '3466ea4bcfc1993cceb3f33d551809d47ec81a9696809865827b81d4bff095a1',
  'lnbc100u1p59nukppp5x3nw5j70cxvnen4n7v742xqf63lvsx5kj6qfsevz0wqaf0lsjkssdpsg3jhqmmnd96zqvfsxqcrqgrnv968xgr5dusywctwv9kk7uepcqzzsxqrrsssp5g4h648k59cpqdgs53g2j5qgzjk379xxw9t2pw290rm6tnrwagzts9qxpqysgqznhly6h3mqtw0qms80rkt7c36s4t0mreyl4q2nczufw38k47h27rn342w3c0d9jskgvxduymdn86t6j8847ds69wqc9ga7fmprg6rccq3f5llw',
  NULL,
  'Deposit 10000 sats to Ganamos!',
  '2025-06-24 00:35:14.205693+00',
  '2025-06-24 00:35:36.073+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '5a4ef1dd-ae35-48af-a406-4657247f0ff9',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'deposit',
  10000,
  'completed',
  'afb5b9b156576f18fd23e285c0ebb1c2e18b6a2612d86fa6e74563f631edf5b8',
  'lnbc100u1p59790spp5476mnv2k2ah33lfru2zup6a3ctsck63xztvxlfh8g43lvv0d7kuqdpsg3jhqmmnd96zqvfsxqcrqgrnv968xgr5dusywctwv9kk7uepcqzzsxqrrsssp56wyl8xrqdf0dttdlwcjfj570alf43hdgl2pemy32zy8satrtztpq9qxpqysgqlks2858dp80thpad4lxwhdugvl03lha25xsmdu2ypjk94rtteux4hjfw232xsq2dsxh9pgv726dhafyz4ewrx65dfj65wn5sa3n7p4qq575284',
  NULL,
  'Deposit 10000 sats to Ganamos!',
  '2025-06-27 22:06:40.909189+00',
  '2025-06-27 22:07:19.363+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  'e58dc30e-75e6-436d-ab9a-4abd3dff9e4e',
  '61467f5f-36a8-4945-89e0-572b15fcedde',
  'deposit',
  1000,
  'completed',
  '6be02e8bdb30208c7b94871e7b60211fdb474b24c5912cf4a6fec77c7f7b7876',
  'lnbc10u1p5979u0pp5d0szaz7mxqsgc7u5su08kcpprld5wjeyckgjea9xlmrhclmm0pmqdp0g3jhqmmnd96zqvfsxqczqumpw3ejqar0yprkzmnpd4hhxggcqzzsxqrrsssp5zxrpamwq425sr4flp4t929rgcvdkhfkwsszc5ze4egugk2p4dvjq9qxpqysgq67v26w0yetn52gk302fkcfy723yjjuzj23a6hnf3kat653lhczy54n0gt7n7upcvsx9d9un0u5uu7wy8auaxguc2xmefff649szkatgp5f6ry0',
  NULL,
  'Deposit 1000 sats to Ganamos!',
  '2025-06-27 22:13:35.889127+00',
  '2025-06-27 22:13:55.831+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '2e7ab1c1-1a16-4fc7-a4f9-dc1fb7ebdb8b',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'withdrawal',
  1000,
  'failed',
  NULL,
  'lnbc1p59lw9gpp59tvjml7xfnvj9rgs9ng4dfd30hvk4karsza2x3p875m53aq2dg5qdp9f35kw6r5de5kueeqv3jhqmmnd96zqvpqgf2yxcqzzsxqrrssrzjqvphmsywntrrhqjcraumvc4y6r8v4z5v593trte429v4hredj7ms5zmpevqqc6cqq5qqqqqqqqqqqqqq2qrzjqw4t06fjwutwa9rt37l6uqumpku9x4j5neevtn9pz04x0zfapqs72z6hzuqq8ncqqvqqqqqqqqqqqqqq2qrzjqw4t06fjwutwa9rt37l6uqumpku9x4j5neevtn9pz04x0zfapqs72r9jh5qqgwsqqyqqqqqqqqqqqqqq2qrzjqvphmsywntrrhqjcraumvc4y6r8v4z5v593trte429v4hredj7ms5zmpevqqc6cqqsqqqqqqqqqqqqqq2qsp58dwkcy0ncet68uakv3g564m285q3z22nd7mesky7fc3gjnfr69dq9qxpqysgqx7sp2pqhkx3hj55qz8v7afq4j4tr27ys0trmzf9hf5p2v0lf69hnqslcgrzz5fc0dqpmjnmxwpwtxrxewv8tn67t7cw45pkm76x33qcq03nmqa',
  NULL,
  'Withdrawal of 1000 sats from Ganamos!',
  '2025-06-28 09:59:21.463799+00',
  '2025-06-28 09:59:21.693+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '0b47ddba-870c-4994-a0cc-1790109954be',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'withdrawal',
  1000,
  'failed',
  NULL,
  'lnbc1p59lw9gpp59tvjml7xfnvj9rgs9ng4dfd30hvk4karsza2x3p875m53aq2dg5qdp9f35kw6r5de5kueeqv3jhqmmnd96zqvpqgf2yxcqzzsxqrrssrzjqvphmsywntrrhqjcraumvc4y6r8v4z5v593trte429v4hredj7ms5zmpevqqc6cqq5qqqqqqqqqqqqqq2qrzjqw4t06fjwutwa9rt37l6uqumpku9x4j5neevtn9pz04x0zfapqs72z6hzuqq8ncqqvqqqqqqqqqqqqqq2qrzjqw4t06fjwutwa9rt37l6uqumpku9x4j5neevtn9pz04x0zfapqs72r9jh5qqgwsqqyqqqqqqqqqqqqqq2qrzjqvphmsywntrrhqjcraumvc4y6r8v4z5v593trte429v4hredj7ms5zmpevqqc6cqqsqqqqqqqqqqqqqq2qsp58dwkcy0ncet68uakv3g564m285q3z22nd7mesky7fc3gjnfr69dq9qxpqysgqx7sp2pqhkx3hj55qz8v7afq4j4tr27ys0trmzf9hf5p2v0lf69hnqslcgrzz5fc0dqpmjnmxwpwtxrxewv8tn67t7cw45pkm76x33qcq03nmqa',
  NULL,
  'Withdrawal of 1000 sats from Ganamos!',
  '2025-06-28 09:59:30.812071+00',
  '2025-06-28 09:59:30.947+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  'e58d6f32-839a-481b-909a-4dba0521082a',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'withdrawal',
  1000,
  'failed',
  NULL,
  'lnbc1p59lw9gpp59tvjml7xfnvj9rgs9ng4dfd30hvk4karsza2x3p875m53aq2dg5qdp9f35kw6r5de5kueeqv3jhqmmnd96zqvpqgf2yxcqzzsxqrrssrzjqvphmsywntrrhqjcraumvc4y6r8v4z5v593trte429v4hredj7ms5zmpevqqc6cqq5qqqqqqqqqqqqqq2qrzjqw4t06fjwutwa9rt37l6uqumpku9x4j5neevtn9pz04x0zfapqs72z6hzuqq8ncqqvqqqqqqqqqqqqqq2qrzjqw4t06fjwutwa9rt37l6uqumpku9x4j5neevtn9pz04x0zfapqs72r9jh5qqgwsqqyqqqqqqqqqqqqqq2qrzjqvphmsywntrrhqjcraumvc4y6r8v4z5v593trte429v4hredj7ms5zmpevqqc6cqqsqqqqqqqqqqqqqq2qsp58dwkcy0ncet68uakv3g564m285q3z22nd7mesky7fc3gjnfr69dq9qxpqysgqx7sp2pqhkx3hj55qz8v7afq4j4tr27ys0trmzf9hf5p2v0lf69hnqslcgrzz5fc0dqpmjnmxwpwtxrxewv8tn67t7cw45pkm76x33qcq03nmqa',
  NULL,
  'Withdrawal of 1000 sats from Ganamos!',
  '2025-06-28 09:59:53.769321+00',
  '2025-06-28 09:59:53.882+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '460e52c5-376f-4682-9145-caa2f16855fc',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'withdrawal',
  2000,
  'failed',
  NULL,
  'lnbc1p59lw9gpp59tvjml7xfnvj9rgs9ng4dfd30hvk4karsza2x3p875m53aq2dg5qdp9f35kw6r5de5kueeqv3jhqmmnd96zqvpqgf2yxcqzzsxqrrssrzjqvphmsywntrrhqjcraumvc4y6r8v4z5v593trte429v4hredj7ms5zmpevqqc6cqq5qqqqqqqqqqqqqq2qrzjqw4t06fjwutwa9rt37l6uqumpku9x4j5neevtn9pz04x0zfapqs72z6hzuqq8ncqqvqqqqqqqqqqqqqq2qrzjqw4t06fjwutwa9rt37l6uqumpku9x4j5neevtn9pz04x0zfapqs72r9jh5qqgwsqqyqqqqqqqqqqqqqq2qrzjqvphmsywntrrhqjcraumvc4y6r8v4z5v593trte429v4hredj7ms5zmpevqqc6cqqsqqqqqqqqqqqqqq2qsp58dwkcy0ncet68uakv3g564m285q3z22nd7mesky7fc3gjnfr69dq9qxpqysgqx7sp2pqhkx3hj55qz8v7afq4j4tr27ys0trmzf9hf5p2v0lf69hnqslcgrzz5fc0dqpmjnmxwpwtxrxewv8tn67t7cw45pkm76x33qcq03nmqa',
  NULL,
  'Withdrawal of 2000 sats from Ganamos!',
  '2025-06-28 10:01:21.265648+00',
  '2025-06-28 10:01:21.469+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  'bf8d47e6-e63e-44fc-a3ab-1f38dad03d96',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'withdrawal',
  300,
  'failed',
  NULL,
  'lnbc1p59lw9gpp59tvjml7xfnvj9rgs9ng4dfd30hvk4karsza2x3p875m53aq2dg5qdp9f35kw6r5de5kueeqv3jhqmmnd96zqvpqgf2yxcqzzsxqrrssrzjqvphmsywntrrhqjcraumvc4y6r8v4z5v593trte429v4hredj7ms5zmpevqqc6cqq5qqqqqqqqqqqqqq2qrzjqw4t06fjwutwa9rt37l6uqumpku9x4j5neevtn9pz04x0zfapqs72z6hzuqq8ncqqvqqqqqqqqqqqqqq2qrzjqw4t06fjwutwa9rt37l6uqumpku9x4j5neevtn9pz04x0zfapqs72r9jh5qqgwsqqyqqqqqqqqqqqqqq2qrzjqvphmsywntrrhqjcraumvc4y6r8v4z5v593trte429v4hredj7ms5zmpevqqc6cqqsqqqqqqqqqqqqqq2qsp58dwkcy0ncet68uakv3g564m285q3z22nd7mesky7fc3gjnfr69dq9qxpqysgqx7sp2pqhkx3hj55qz8v7afq4j4tr27ys0trmzf9hf5p2v0lf69hnqslcgrzz5fc0dqpmjnmxwpwtxrxewv8tn67t7cw45pkm76x33qcq03nmqa',
  NULL,
  'Withdrawal of 300 sats from Ganamos!',
  '2025-06-28 10:03:56.569469+00',
  '2025-06-28 10:03:56.721+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  'f1de934f-79a4-4e02-87f0-759198b384ce',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'withdrawal',
  300,
  'failed',
  NULL,
  'lnbc1p59lw9gpp59tvjml7xfnvj9rgs9ng4dfd30hvk4karsza2x3p875m53aq2dg5qdp9f35kw6r5de5kueeqv3jhqmmnd96zqvpqgf2yxcqzzsxqrrssrzjqvphmsywntrrhqjcraumvc4y6r8v4z5v593trte429v4hredj7ms5zmpevqqc6cqq5qqqqqqqqqqqqqq2qrzjqw4t06fjwutwa9rt37l6uqumpku9x4j5neevtn9pz04x0zfapqs72z6hzuqq8ncqqvqqqqqqqqqqqqqq2qrzjqw4t06fjwutwa9rt37l6uqumpku9x4j5neevtn9pz04x0zfapqs72r9jh5qqgwsqqyqqqqqqqqqqqqqq2qrzjqvphmsywntrrhqjcraumvc4y6r8v4z5v593trte429v4hredj7ms5zmpevqqc6cqqsqqqqqqqqqqqqqq2qsp58dwkcy0ncet68uakv3g564m285q3z22nd7mesky7fc3gjnfr69dq9qxpqysgqx7sp2pqhkx3hj55qz8v7afq4j4tr27ys0trmzf9hf5p2v0lf69hnqslcgrzz5fc0dqpmjnmxwpwtxrxewv8tn67t7cw45pkm76x33qcq03nmqa',
  NULL,
  'Withdrawal of 300 sats from Ganamos!',
  '2025-06-28 10:04:21.166809+00',
  '2025-06-28 10:04:21.307+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '269b4359-cb1d-4539-8ff0-d1935c5dd3a1',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'withdrawal',
  300,
  'failed',
  NULL,
  'lnbc1p59lw9gpp59tvjml7xfnvj9rgs9ng4dfd30hvk4karsza2x3p875m53aq2dg5qdp9f35kw6r5de5kueeqv3jhqmmnd96zqvpqgf2yxcqzzsxqrrssrzjqvphmsywntrrhqjcraumvc4y6r8v4z5v593trte429v4hredj7ms5zmpevqqc6cqq5qqqqqqqqqqqqqq2qrzjqw4t06fjwutwa9rt37l6uqumpku9x4j5neevtn9pz04x0zfapqs72z6hzuqq8ncqqvqqqqqqqqqqqqqq2qrzjqw4t06fjwutwa9rt37l6uqumpku9x4j5neevtn9pz04x0zfapqs72r9jh5qqgwsqqyqqqqqqqqqqqqqq2qrzjqvphmsywntrrhqjcraumvc4y6r8v4z5v593trte429v4hredj7ms5zmpevqqc6cqqsqqqqqqqqqqqqqq2qsp58dwkcy0ncet68uakv3g564m285q3z22nd7mesky7fc3gjnfr69dq9qxpqysgqx7sp2pqhkx3hj55qz8v7afq4j4tr27ys0trmzf9hf5p2v0lf69hnqslcgrzz5fc0dqpmjnmxwpwtxrxewv8tn67t7cw45pkm76x33qcq03nmqa',
  NULL,
  'Withdrawal of 300 sats from Ganamos!',
  '2025-06-28 10:08:09.970253+00',
  '2025-06-28 10:08:10.661+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  'c1ae233f-fe64-43b4-8d96-779296dd19a6',
  'ce210e13-15c9-467b-b86e-6768dbdc3bca',
  'internal',
  -3000,
  'completed',
  NULL,
  NULL,
  NULL,
  'Transfer to @brian-murray: heltec?',
  '2025-10-03 08:05:44.417456+00',
  '2025-10-03 08:05:44.417456+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  'ddfc8681-7bb5-466d-8859-89327efcf64e',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'internal',
  3000,
  'completed',
  NULL,
  NULL,
  NULL,
  'Transfer from @Annie: heltec?',
  '2025-10-03 08:05:44.417456+00',
  '2025-10-03 08:05:44.417456+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '3e284a90-f9c2-401c-9013-4f4c567cb26c',
  'ce210e13-15c9-467b-b86e-6768dbdc3bca',
  'internal',
  -300,
  'completed',
  NULL,
  NULL,
  NULL,
  'Transfer to @brian-murray',
  '2025-10-05 20:39:44.187961+00',
  '2025-10-05 20:39:44.187961+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '7713d87f-f27f-4031-90bb-d35e48ef6f3d',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'internal',
  300,
  'completed',
  NULL,
  NULL,
  NULL,
  'Transfer from @Annie',
  '2025-10-05 20:39:44.187961+00',
  '2025-10-05 20:39:44.187961+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '1167537d-79ca-4cc7-95a6-7d24deb2d3ee',
  'ce210e13-15c9-467b-b86e-6768dbdc3bca',
  'internal',
  -333,
  'completed',
  NULL,
  NULL,
  NULL,
  'Transfer to @brian-murray: hi stark!',
  '2025-10-09 17:44:32.069711+00',
  '2025-10-09 17:44:32.069711+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '3dd5a08b-efb6-4069-8edc-5bda6611aeaa',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'internal',
  333,
  'completed',
  NULL,
  NULL,
  NULL,
  'Transfer from @Annie: hi stark!',
  '2025-10-09 17:44:32.069711+00',
  '2025-10-09 17:44:32.069711+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '06c4e33f-30b0-4884-9bcd-ae5a0d114fb6',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'internal',
  300,
  'completed',
  NULL,
  NULL,
  NULL,
  'Transfer from @Annie: Coco?',
  '2025-10-12 19:36:56.010362+00',
  '2025-10-12 19:36:56.010362+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  'e8a3a647-2a71-4dc9-be2a-77a58af2476d',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'withdrawal',
  1000,
  'failed',
  NULL,
  'lnbc1p59lw9gpp59tvjml7xfnvj9rgs9ng4dfd30hvk4karsza2x3p875m53aq2dg5qdp9f35kw6r5de5kueeqv3jhqmmnd96zqvpqgf2yxcqzzsxqrrssrzjqvphmsywntrrhqjcraumvc4y6r8v4z5v593trte429v4hredj7ms5zmpevqqc6cqq5qqqqqqqqqqqqqq2qrzjqw4t06fjwutwa9rt37l6uqumpku9x4j5neevtn9pz04x0zfapqs72z6hzuqq8ncqqvqqqqqqqqqqqqqq2qrzjqw4t06fjwutwa9rt37l6uqumpku9x4j5neevtn9pz04x0zfapqs72r9jh5qqgwsqqyqqqqqqqqqqqqqq2qrzjqvphmsywntrrhqjcraumvc4y6r8v4z5v593trte429v4hredj7ms5zmpevqqc6cqqsqqqqqqqqqqqqqq2qsp58dwkcy0ncet68uakv3g564m285q3z22nd7mesky7fc3gjnfr69dq9qxpqysgqx7sp2pqhkx3hj55qz8v7afq4j4tr27ys0trmzf9hf5p2v0lf69hnqslcgrzz5fc0dqpmjnmxwpwtxrxewv8tn67t7cw45pkm76x33qcq03nmqa',
  NULL,
  'Withdrawal of 1000 sats from Ganamos!',
  '2025-06-28 10:08:30.872836+00',
  '2025-06-28 10:08:30.996+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '55657e5b-1777-4016-a32a-c64135ca2881',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'withdrawal',
  1000,
  'failed',
  NULL,
  'lnbc1p59lw9gpp59tvjml7xfnvj9rgs9ng4dfd30hvk4karsza2x3p875m53aq2dg5qdp9f35kw6r5de5kueeqv3jhqmmnd96zqvpqgf2yxcqzzsxqrrssrzjqvphmsywntrrhqjcraumvc4y6r8v4z5v593trte429v4hredj7ms5zmpevqqc6cqq5qqqqqqqqqqqqqq2qrzjqw4t06fjwutwa9rt37l6uqumpku9x4j5neevtn9pz04x0zfapqs72z6hzuqq8ncqqvqqqqqqqqqqqqqq2qrzjqw4t06fjwutwa9rt37l6uqumpku9x4j5neevtn9pz04x0zfapqs72r9jh5qqgwsqqyqqqqqqqqqqqqqq2qrzjqvphmsywntrrhqjcraumvc4y6r8v4z5v593trte429v4hredj7ms5zmpevqqc6cqqsqqqqqqqqqqqqqq2qsp58dwkcy0ncet68uakv3g564m285q3z22nd7mesky7fc3gjnfr69dq9qxpqysgqx7sp2pqhkx3hj55qz8v7afq4j4tr27ys0trmzf9hf5p2v0lf69hnqslcgrzz5fc0dqpmjnmxwpwtxrxewv8tn67t7cw45pkm76x33qcq03nmqa',
  NULL,
  'Withdrawal of 1000 sats from Ganamos!',
  '2025-06-28 10:08:58.842658+00',
  '2025-06-28 10:08:59.101+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '81c359cf-6e18-47de-a1ed-a0426bf71a0f',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'withdrawal',
  300,
  'failed',
  NULL,
  'lnbc1p59lw9gpp59tvjml7xfnvj9rgs9ng4dfd30hvk4karsza2x3p875m53aq2dg5qdp9f35kw6r5de5kueeqv3jhqmmnd96zqvpqgf2yxcqzzsxqrrssrzjqvphmsywntrrhqjcraumvc4y6r8v4z5v593trte429v4hredj7ms5zmpevqqc6cqq5qqqqqqqqqqqqqq2qrzjqw4t06fjwutwa9rt37l6uqumpku9x4j5neevtn9pz04x0zfapqs72z6hzuqq8ncqqvqqqqqqqqqqqqqq2qrzjqw4t06fjwutwa9rt37l6uqumpku9x4j5neevtn9pz04x0zfapqs72r9jh5qqgwsqqyqqqqqqqqqqqqqq2qrzjqvphmsywntrrhqjcraumvc4y6r8v4z5v593trte429v4hredj7ms5zmpevqqc6cqqsqqqqqqqqqqqqqq2qsp58dwkcy0ncet68uakv3g564m285q3z22nd7mesky7fc3gjnfr69dq9qxpqysgqx7sp2pqhkx3hj55qz8v7afq4j4tr27ys0trmzf9hf5p2v0lf69hnqslcgrzz5fc0dqpmjnmxwpwtxrxewv8tn67t7cw45pkm76x33qcq03nmqa',
  NULL,
  'Withdrawal of 300 sats from Ganamos!',
  '2025-06-28 10:09:04.586404+00',
  '2025-06-28 10:09:04.727+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  'aefc28d1-6ad9-4925-af87-91de2ed1d5f0',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'withdrawal',
  1000,
  'failed',
  NULL,
  'lnbc1p59lw9gpp59tvjml7xfnvj9rgs9ng4dfd30hvk4karsza2x3p875m53aq2dg5qdp9f35kw6r5de5kueeqv3jhqmmnd96zqvpqgf2yxcqzzsxqrrssrzjqvphmsywntrrhqjcraumvc4y6r8v4z5v593trte429v4hredj7ms5zmpevqqc6cqq5qqqqqqqqqqqqqq2qrzjqw4t06fjwutwa9rt37l6uqumpku9x4j5neevtn9pz04x0zfapqs72z6hzuqq8ncqqvqqqqqqqqqqqqqq2qrzjqw4t06fjwutwa9rt37l6uqumpku9x4j5neevtn9pz04x0zfapqs72r9jh5qqgwsqqyqqqqqqqqqqqqqq2qrzjqvphmsywntrrhqjcraumvc4y6r8v4z5v593trte429v4hredj7ms5zmpevqqc6cqqsqqqqqqqqqqqqqq2qsp58dwkcy0ncet68uakv3g564m285q3z22nd7mesky7fc3gjnfr69dq9qxpqysgqx7sp2pqhkx3hj55qz8v7afq4j4tr27ys0trmzf9hf5p2v0lf69hnqslcgrzz5fc0dqpmjnmxwpwtxrxewv8tn67t7cw45pkm76x33qcq03nmqa',
  NULL,
  'Withdrawal of 1000 sats from Ganamos!',
  '2025-06-28 14:23:59.882578+00',
  '2025-06-28 14:23:59.895+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '7283daba-56dd-48fb-bc62-00a24bca7d8a',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'withdrawal',
  1000,
  'failed',
  NULL,
  'lnbc10u1p59l760pp5nftakarylqav6j7tm5ffaxcdguqq3450q357fc2z8kjurrsfq6zqdp0f35kw6r5de5kueeqv3jhqmmnd96zqvpwxqcrqvp3ypp9gsccqzzsxqrrssrzjqvphmsywntrrhqjcraumvc4y6r8v4z5v593trte429v4hredj7ms5zmpevqqc6cqq5qqqqqqqqqqqqqq2qsp5kcnq5hwkxzej04qd8jgm4zhfdctn5mf9dk85hp4m0sls2nn3rt4q9qxpqysgq2ypgedg8vj3q477re8dahmxaxv6qdgnl55zcx9gujyrn8l0a2x092j2fxrg66hyp2he79cu03se5vr654utq07sf5h4ex98f7ql9axqq8su2tf',
  NULL,
  'Withdrawal of 1000 sats from Ganamos!',
  '2025-06-28 14:26:11.078783+00',
  '2025-06-28 14:26:11.094+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '2063e101-5d0a-4bb9-96c3-96baadd56113',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'withdrawal',
  1000,
  'failed',
  NULL,
  'lnbc1p5xm56dpp50uwjd2k9c0n6ptpalq7e84t4q7eurfdmvue79xey6nxqhgrdakzqdp9f35kw6r5de5kueeqv3jhqmmnd96zqvpqgf2yxcqzzsxqrrssrzjqvphmsywntrrhqjcraumvc4y6r8v4z5v593trte429v4hredj7ms5zmpevqqc6cqqsqqqqqqqqqqqqqq2qrzjqw4t06fjwutwa9rt37l6uqumpku9x4j5neevtn9pz04x0zfapqs72r9jh5qqgwsqqyqqqqqqqqqqqqqq2qrzjqw4t06fjwutwa9rt37l6uqumpku9x4j5neevtn9pz04x0zfapqs72z6hzuqq8ncqqvqqqqqqqqqqqqqq2qrzjqvphmsywntrrhqjcraumvc4y6r8v4z5v593trte429v4hredj7ms5zmpevqqc6cqq5qqqqqqqqqqqqqq2qsp55rshtx6pqnyrppx522k0ufn6n8nljs4zu8mw6r5cm5s402e8cswq9qxpqysgqgpdz6z2xydhyug3gu0lcqjtmt3n83pcd2fzlv0zxq9u0u389ge33xsc9gdxx346wkal5m9w7rvf9eptdtq03f4kz52cdf8eh5q690eqqz54s5x',
  NULL,
  'Withdrawal of 1000 sats from Ganamos!',
  '2025-07-09 02:26:33.594936+00',
  '2025-07-09 02:26:33.668+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '5e21b4ab-6305-4084-9411-22b486c069f1',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'withdrawal',
  1000,
  'failed',
  NULL,
  'lnbc1p5gxdqjpp500559sk7erv3tugdqsa2y5376jdr3e0de0kdhl4mcnjhkm2nw8dqdp9f35kw6r5de5kueeqv3jhqmmnd96zqvpqgf2yxcqzzsxqrrssrzjqvphmsywntrrhqjcraumvc4y6r8v4z5v593trte429v4hredj7ms5rdxngqqgecqqyqqqqqqqqqqqqqq2qrzjqw4t06fjwutwa9rt37l6uqumpku9x4j5neevtn9pz04x0zfapqs72r9kdyqqvcsqqyqqqqqqqqqqqqqq2qrzjqvphmsywntrrhqjcraumvc4y6r8v4z5v593trte429v4hredj7ms5rpeeqqqt9cqqyqqqqqqqqqqqqqq2qsp5l85k2gv50sgmt8ut0pejkm684j47t0vjm3sr58llz0es6jkjjn7s9qxpqysgqmnjpydanyexjp8gs7jx5k2szh7hml7pewf5q5l0l3cn9eeqhyy25kwnz0kwt2amrwftggdmp55eydrh2u3tzha34l0hhcfx6rs6wy7qqa2dgsj',
  NULL,
  'Withdrawal of 1000 sats from Ganamos!',
  '2025-07-25 07:37:15.787664+00',
  '2025-07-25 07:37:15.993+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  'd142729f-a35b-4e7f-8da2-60667576055b',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'withdrawal',
  1000,
  'failed',
  NULL,
  'lnbc1p5gxdqjpp500559sk7erv3tugdqsa2y5376jdr3e0de0kdhl4mcnjhkm2nw8dqdp9f35kw6r5de5kueeqv3jhqmmnd96zqvpqgf2yxcqzzsxqrrssrzjqvphmsywntrrhqjcraumvc4y6r8v4z5v593trte429v4hredj7ms5rdxngqqgecqqyqqqqqqqqqqqqqq2qrzjqw4t06fjwutwa9rt37l6uqumpku9x4j5neevtn9pz04x0zfapqs72r9kdyqqvcsqqyqqqqqqqqqqqqqq2qrzjqvphmsywntrrhqjcraumvc4y6r8v4z5v593trte429v4hredj7ms5rpeeqqqt9cqqyqqqqqqqqqqqqqq2qsp5l85k2gv50sgmt8ut0pejkm684j47t0vjm3sr58llz0es6jkjjn7s9qxpqysgqmnjpydanyexjp8gs7jx5k2szh7hml7pewf5q5l0l3cn9eeqhyy25kwnz0kwt2amrwftggdmp55eydrh2u3tzha34l0hhcfx6rs6wy7qqa2dgsj',
  NULL,
  'Withdrawal of 1000 sats from Ganamos!',
  '2025-07-25 07:37:24.775027+00',
  '2025-07-25 07:37:24.765+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '448d6090-de00-4469-b735-e93970cb4aa6',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'withdrawal',
  1000,
  'failed',
  NULL,
  'lnbc1p5gxdqjpp500559sk7erv3tugdqsa2y5376jdr3e0de0kdhl4mcnjhkm2nw8dqdp9f35kw6r5de5kueeqv3jhqmmnd96zqvpqgf2yxcqzzsxqrrssrzjqvphmsywntrrhqjcraumvc4y6r8v4z5v593trte429v4hredj7ms5rdxngqqgecqqyqqqqqqqqqqqqqq2qrzjqw4t06fjwutwa9rt37l6uqumpku9x4j5neevtn9pz04x0zfapqs72r9kdyqqvcsqqyqqqqqqqqqqqqqq2qrzjqvphmsywntrrhqjcraumvc4y6r8v4z5v593trte429v4hredj7ms5rpeeqqqt9cqqyqqqqqqqqqqqqqq2qsp5l85k2gv50sgmt8ut0pejkm684j47t0vjm3sr58llz0es6jkjjn7s9qxpqysgqmnjpydanyexjp8gs7jx5k2szh7hml7pewf5q5l0l3cn9eeqhyy25kwnz0kwt2amrwftggdmp55eydrh2u3tzha34l0hhcfx6rs6wy7qqa2dgsj',
  NULL,
  'Withdrawal of 1000 sats from Ganamos!',
  '2025-07-25 07:37:34.042981+00',
  '2025-07-25 07:37:34.011+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '53ff0589-6fed-4c21-87c6-3668a151b16d',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'withdrawal',
  1000,
  'failed',
  NULL,
  'lnbc1p5gxdqjpp500559sk7erv3tugdqsa2y5376jdr3e0de0kdhl4mcnjhkm2nw8dqdp9f35kw6r5de5kueeqv3jhqmmnd96zqvpqgf2yxcqzzsxqrrssrzjqvphmsywntrrhqjcraumvc4y6r8v4z5v593trte429v4hredj7ms5rdxngqqgecqqyqqqqqqqqqqqqqq2qrzjqw4t06fjwutwa9rt37l6uqumpku9x4j5neevtn9pz04x0zfapqs72r9kdyqqvcsqqyqqqqqqqqqqqqqq2qrzjqvphmsywntrrhqjcraumvc4y6r8v4z5v593trte429v4hredj7ms5rpeeqqqt9cqqyqqqqqqqqqqqqqq2qsp5l85k2gv50sgmt8ut0pejkm684j47t0vjm3sr58llz0es6jkjjn7s9qxpqysgqmnjpydanyexjp8gs7jx5k2szh7hml7pewf5q5l0l3cn9eeqhyy25kwnz0kwt2amrwftggdmp55eydrh2u3tzha34l0hhcfx6rs6wy7qqa2dgsj',
  NULL,
  'Withdrawal of 1000 sats from Ganamos!',
  '2025-07-25 07:37:44.414592+00',
  '2025-07-25 07:37:44.395+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  'a5c82794-dcd3-4d5c-addc-d0bb530599db',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'withdrawal',
  1000,
  'failed',
  NULL,
  'lnbc1p5gxdqjpp500559sk7erv3tugdqsa2y5376jdr3e0de0kdhl4mcnjhkm2nw8dqdp9f35kw6r5de5kueeqv3jhqmmnd96zqvpqgf2yxcqzzsxqrrssrzjqvphmsywntrrhqjcraumvc4y6r8v4z5v593trte429v4hredj7ms5rdxngqqgecqqyqqqqqqqqqqqqqq2qrzjqw4t06fjwutwa9rt37l6uqumpku9x4j5neevtn9pz04x0zfapqs72r9kdyqqvcsqqyqqqqqqqqqqqqqq2qrzjqvphmsywntrrhqjcraumvc4y6r8v4z5v593trte429v4hredj7ms5rpeeqqqt9cqqyqqqqqqqqqqqqqq2qsp5l85k2gv50sgmt8ut0pejkm684j47t0vjm3sr58llz0es6jkjjn7s9qxpqysgqmnjpydanyexjp8gs7jx5k2szh7hml7pewf5q5l0l3cn9eeqhyy25kwnz0kwt2amrwftggdmp55eydrh2u3tzha34l0hhcfx6rs6wy7qqa2dgsj',
  NULL,
  'Withdrawal of 1000 sats from Ganamos!',
  '2025-07-25 07:47:19.522084+00',
  '2025-07-25 07:47:19.823+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '82f2e4da-8929-45f0-abaa-1994806373a3',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'withdrawal',
  1000,
  'failed',
  NULL,
  'lnbc1p5gxdqjpp500559sk7erv3tugdqsa2y5376jdr3e0de0kdhl4mcnjhkm2nw8dqdp9f35kw6r5de5kueeqv3jhqmmnd96zqvpqgf2yxcqzzsxqrrssrzjqvphmsywntrrhqjcraumvc4y6r8v4z5v593trte429v4hredj7ms5rdxngqqgecqqyqqqqqqqqqqqqqq2qrzjqw4t06fjwutwa9rt37l6uqumpku9x4j5neevtn9pz04x0zfapqs72r9kdyqqvcsqqyqqqqqqqqqqqqqq2qrzjqvphmsywntrrhqjcraumvc4y6r8v4z5v593trte429v4hredj7ms5rpeeqqqt9cqqyqqqqqqqqqqqqqq2qsp5l85k2gv50sgmt8ut0pejkm684j47t0vjm3sr58llz0es6jkjjn7s9qxpqysgqmnjpydanyexjp8gs7jx5k2szh7hml7pewf5q5l0l3cn9eeqhyy25kwnz0kwt2amrwftggdmp55eydrh2u3tzha34l0hhcfx6rs6wy7qqa2dgsj',
  NULL,
  'Withdrawal of 1000 sats from Ganamos!',
  '2025-07-25 07:47:35.752062+00',
  '2025-07-25 07:47:35.905+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '5d281b85-a597-4b2b-8506-622acf96bbe3',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'withdrawal',
  1000,
  'failed',
  NULL,
  'lnbc1p5gxdqjpp500559sk7erv3tugdqsa2y5376jdr3e0de0kdhl4mcnjhkm2nw8dqdp9f35kw6r5de5kueeqv3jhqmmnd96zqvpqgf2yxcqzzsxqrrssrzjqvphmsywntrrhqjcraumvc4y6r8v4z5v593trte429v4hredj7ms5rdxngqqgecqqyqqqqqqqqqqqqqq2qrzjqw4t06fjwutwa9rt37l6uqumpku9x4j5neevtn9pz04x0zfapqs72r9kdyqqvcsqqyqqqqqqqqqqqqqq2qrzjqvphmsywntrrhqjcraumvc4y6r8v4z5v593trte429v4hredj7ms5rpeeqqqt9cqqyqqqqqqqqqqqqqq2qsp5l85k2gv50sgmt8ut0pejkm684j47t0vjm3sr58llz0es6jkjjn7s9qxpqysgqmnjpydanyexjp8gs7jx5k2szh7hml7pewf5q5l0l3cn9eeqhyy25kwnz0kwt2amrwftggdmp55eydrh2u3tzha34l0hhcfx6rs6wy7qqa2dgsj',
  NULL,
  'Withdrawal of 1000 sats from Ganamos!',
  '2025-07-25 07:51:59.517587+00',
  '2025-07-25 07:51:59.492+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '9213a2ad-7701-46a2-a6f0-666b2e07d6f0',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'withdrawal',
  1000,
  'failed',
  NULL,
  'lnbc1p5gxdqjpp500559sk7erv3tugdqsa2y5376jdr3e0de0kdhl4mcnjhkm2nw8dqdp9f35kw6r5de5kueeqv3jhqmmnd96zqvpqgf2yxcqzzsxqrrssrzjqvphmsywntrrhqjcraumvc4y6r8v4z5v593trte429v4hredj7ms5rdxngqqgecqqyqqqqqqqqqqqqqq2qrzjqw4t06fjwutwa9rt37l6uqumpku9x4j5neevtn9pz04x0zfapqs72r9kdyqqvcsqqyqqqqqqqqqqqqqq2qrzjqvphmsywntrrhqjcraumvc4y6r8v4z5v593trte429v4hredj7ms5rpeeqqqt9cqqyqqqqqqqqqqqqqq2qsp5l85k2gv50sgmt8ut0pejkm684j47t0vjm3sr58llz0es6jkjjn7s9qxpqysgqmnjpydanyexjp8gs7jx5k2szh7hml7pewf5q5l0l3cn9eeqhyy25kwnz0kwt2amrwftggdmp55eydrh2u3tzha34l0hhcfx6rs6wy7qqa2dgsj',
  NULL,
  'Withdrawal of 1000 sats from Ganamos!',
  '2025-07-25 07:52:36.071943+00',
  '2025-07-25 07:52:36.038+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '4242da1e-98e0-4c8c-9e51-40f7b619ee66',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'withdrawal',
  1000,
  'failed',
  NULL,
  'lnbc1p5gxdqjpp500559sk7erv3tugdqsa2y5376jdr3e0de0kdhl4mcnjhkm2nw8dqdp9f35kw6r5de5kueeqv3jhqmmnd96zqvpqgf2yxcqzzsxqrrssrzjqvphmsywntrrhqjcraumvc4y6r8v4z5v593trte429v4hredj7ms5rdxngqqgecqqyqqqqqqqqqqqqqq2qrzjqw4t06fjwutwa9rt37l6uqumpku9x4j5neevtn9pz04x0zfapqs72r9kdyqqvcsqqyqqqqqqqqqqqqqq2qrzjqvphmsywntrrhqjcraumvc4y6r8v4z5v593trte429v4hredj7ms5rpeeqqqt9cqqyqqqqqqqqqqqqqq2qsp5l85k2gv50sgmt8ut0pejkm684j47t0vjm3sr58llz0es6jkjjn7s9qxpqysgqmnjpydanyexjp8gs7jx5k2szh7hml7pewf5q5l0l3cn9eeqhyy25kwnz0kwt2amrwftggdmp55eydrh2u3tzha34l0hhcfx6rs6wy7qqa2dgsj',
  NULL,
  'Withdrawal of 1000 sats from Ganamos!',
  '2025-07-25 07:57:49.324921+00',
  '2025-07-25 07:57:49.295+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '6954d3e5-b2e8-4764-a867-a36af9b6dc44',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'withdrawal',
  1000,
  'failed',
  NULL,
  'lnbc10u1p5gxwg7pp5jvm98aj8d07aanrvngzpzvmx746u9np7jf49rrn68z3c6e2522lqdp0f35kw6r5de5kueeqv3jhqmmnd96zqvpwxqcrqvp3ypp9gsccqzzsxqrrssrzjqvphmsywntrrhqjcraumvc4y6r8v4z5v593trte429v4hredj7ms5rdxngqqgecqqyqqqqqqqqqqqqqq2qsp5ndpvu0clql9e3qg7vs7xr3pt68mn6jm32n0ddtj8sfec76j3v4ps9qxpqysgq9r2cuy2x8s28rz3ujm5pz5dwknfjpywtp4s5xyeashfx6sc9ulq96mu92xfxzd52zrqxfsgl6p7rmszgyjdlv5c3nl844tjanyfmthqpdare3a',
  NULL,
  'Withdrawal of 1000 sats from Ganamos!',
  '2025-07-25 07:58:48.166151+00',
  '2025-07-25 07:58:48.135+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  'cf36d959-f3ba-4ad6-be95-4d23a6c241c5',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'withdrawal',
  1000,
  'failed',
  NULL,
  'lnbc10u1p5gxwg7pp5jvm98aj8d07aanrvngzpzvmx746u9np7jf49rrn68z3c6e2522lqdp0f35kw6r5de5kueeqv3jhqmmnd96zqvpwxqcrqvp3ypp9gsccqzzsxqrrssrzjqvphmsywntrrhqjcraumvc4y6r8v4z5v593trte429v4hredj7ms5rdxngqqgecqqyqqqqqqqqqqqqqq2qsp5ndpvu0clql9e3qg7vs7xr3pt68mn6jm32n0ddtj8sfec76j3v4ps9qxpqysgq9r2cuy2x8s28rz3ujm5pz5dwknfjpywtp4s5xyeashfx6sc9ulq96mu92xfxzd52zrqxfsgl6p7rmszgyjdlv5c3nl844tjanyfmthqpdare3a',
  NULL,
  'Withdrawal of 1000 sats from Ganamos!',
  '2025-07-25 08:02:09.327815+00',
  '2025-07-25 08:02:09.265+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '45a0c7a8-3cbf-4f68-9e32-c4da0b7b46f8',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'withdrawal',
  1000,
  'failed',
  NULL,
  'lnbc10u1p5gxwg7pp5jvm98aj8d07aanrvngzpzvmx746u9np7jf49rrn68z3c6e2522lqdp0f35kw6r5de5kueeqv3jhqmmnd96zqvpwxqcrqvp3ypp9gsccqzzsxqrrssrzjqvphmsywntrrhqjcraumvc4y6r8v4z5v593trte429v4hredj7ms5rdxngqqgecqqyqqqqqqqqqqqqqq2qsp5ndpvu0clql9e3qg7vs7xr3pt68mn6jm32n0ddtj8sfec76j3v4ps9qxpqysgq9r2cuy2x8s28rz3ujm5pz5dwknfjpywtp4s5xyeashfx6sc9ulq96mu92xfxzd52zrqxfsgl6p7rmszgyjdlv5c3nl844tjanyfmthqpdare3a',
  NULL,
  'Withdrawal of 1000 sats from Ganamos!',
  '2025-07-25 08:43:09.034486+00',
  '2025-07-25 08:43:09.275+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  'c03d584c-348d-4e64-8722-7bc20fb5e72b',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'withdrawal',
  1000,
  'completed',
  NULL,
  'lnbc10u1p5gxwg7pp5jvm98aj8d07aanrvngzpzvmx746u9np7jf49rrn68z3c6e2522lqdp0f35kw6r5de5kueeqv3jhqmmnd96zqvpwxqcrqvp3ypp9gsccqzzsxqrrssrzjqvphmsywntrrhqjcraumvc4y6r8v4z5v593trte429v4hredj7ms5rdxngqqgecqqyqqqqqqqqqqqqqq2qsp5ndpvu0clql9e3qg7vs7xr3pt68mn6jm32n0ddtj8sfec76j3v4ps9qxpqysgq9r2cuy2x8s28rz3ujm5pz5dwknfjpywtp4s5xyeashfx6sc9ulq96mu92xfxzd52zrqxfsgl6p7rmszgyjdlv5c3nl844tjanyfmthqpdare3a',
  'kzZT9kdr/d7MbJoEETNm9XXCzD6SalGOejijjWVUUr4=',
  'Withdrawal of 1000 sats from Ganamos!',
  '2025-07-25 08:49:21.623845+00',
  '2025-07-25 08:49:21.94+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '111a0049-f0e5-498a-83cc-085d81bbe02f',
  'ce210e13-15c9-467b-b86e-6768dbdc3bca',
  'internal',
  -2000,
  'completed',
  NULL,
  NULL,
  NULL,
  'Transfer to @brian-murray: heltec',
  '2025-10-03 08:07:29.084074+00',
  '2025-10-03 08:07:29.084074+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '736ef731-d87a-4e4a-86bc-cfea30e0390f',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'internal',
  2000,
  'completed',
  NULL,
  NULL,
  NULL,
  'Transfer from @Annie: heltec',
  '2025-10-03 08:07:29.084074+00',
  '2025-10-03 08:07:29.084074+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '0a2a6260-eb1c-43fa-950e-e23fbaeea4fd',
  'ce210e13-15c9-467b-b86e-6768dbdc3bca',
  'internal',
  -300,
  'completed',
  NULL,
  NULL,
  NULL,
  'Transfer to @brian-murray: coco butter cream',
  '2025-10-05 21:33:37.369083+00',
  '2025-10-05 21:33:37.369083+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '8b84068d-267c-469a-83e1-251338093ede',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'internal',
  300,
  'completed',
  NULL,
  NULL,
  NULL,
  'Transfer from @Annie: coco butter cream',
  '2025-10-05 21:33:37.369083+00',
  '2025-10-05 21:33:37.369083+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  'ab4237bd-5af1-489c-87f5-ffa3038f4637',
  'ce210e13-15c9-467b-b86e-6768dbdc3bca',
  'internal',
  -333,
  'completed',
  NULL,
  NULL,
  NULL,
  'Transfer to @brian-murray: disconnected test',
  '2025-10-12 14:37:02.593395+00',
  '2025-10-12 14:37:02.593395+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  'f79e6bf1-d0bb-46d7-9b5a-06645fff606d',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'internal',
  333,
  'completed',
  NULL,
  NULL,
  NULL,
  'Transfer from @Annie: disconnected test',
  '2025-10-12 14:37:02.593395+00',
  '2025-10-12 14:37:02.593395+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  'fa5c175b-5691-4e35-b24b-0009ad5d7fce',
  'ce210e13-15c9-467b-b86e-6768dbdc3bca',
  'internal',
  -300,
  'completed',
  NULL,
  NULL,
  NULL,
  'Transfer to @brian-murray: Cleared. The table ',
  '2025-10-12 19:38:36.982556+00',
  '2025-10-12 19:38:36.982556+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '83e33dc1-62b8-4727-b602-17652861de7a',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'internal',
  300,
  'completed',
  NULL,
  NULL,
  NULL,
  'Transfer from @Annie: Cleared. The table ',
  '2025-10-12 19:38:36.982556+00',
  '2025-10-12 19:38:36.982556+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '2290e6d5-d615-4a05-bc50-85f638c3ceb3',
  'd60a269f-b1a9-4030-96d5-7ddc3ca5e369',
  'internal',
  -333,
  'completed',
  NULL,
  NULL,
  NULL,
  'Transfer to @brian-murray: Happy dad',
  '2025-10-15 10:03:54.217786+00',
  '2025-10-15 10:03:54.217786+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  'eaa9f485-c417-470b-b2bf-2e6e0f07df3c',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'internal',
  333,
  'completed',
  NULL,
  NULL,
  NULL,
  'Transfer from @Marlowe: Happy dad',
  '2025-10-15 10:03:54.217786+00',
  '2025-10-15 10:03:54.217786+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '63cafb11-e175-4571-8694-785946e7863e',
  'd60a269f-b1a9-4030-96d5-7ddc3ca5e369',
  'internal',
  -333,
  'completed',
  NULL,
  NULL,
  NULL,
  'Transfer to @brian-murray: Daddy',
  '2025-10-15 10:26:14.911011+00',
  '2025-10-15 10:26:14.911011+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '6a53e17e-09d6-4b07-a11d-4680eb2b083a',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'withdrawal',
  1000,
  'completed',
  NULL,
  'lnbc1p5gx3fapp5rn3pyfk8nag0czrep7zuytn5x7fcekvk0ph23q0saw5anqa5r9pqdp9f35kw6r5de5kueeqv3jhqmmnd96zqvpqgf2yxcqzzsxqrrssrzjqvphmsywntrrhqjcraumvc4y6r8v4z5v593trte429v4hredj7ms5rdxngqqgecqqyqqqqqqqqqqqqqq2qrzjqvphmsywntrrhqjcraumvc4y6r8v4z5v593trte429v4hredj7ms5rpeeqqqt9cqqyqqqqqqqqqqqqqq2qrzjqw4t06fjwutwa9rt37l6uqumpku9x4j5neevtn9pz04x0zfapqs72r9kdyqqvcsqqyqqqqqqqqqqqqqq2qsp5k7qevnkwdxx365t6xqhy6ddsguznepmm5jhlsxahmu2pjad5zj4q9qxpqysgqmnmll8v99688250fcje75m7ylvmxvgm0lf2jmfehsj9kl0f5tp5sz9ltkgdrcpjcz8p8q27epy5t0cl9p3nddn9slvfc4swrnngctccpczkkgs',
  'HOISJsefUPwIeQ+Fwi50N5OM2ZZ4bqiB8Oup2YO0GUI=',
  'Withdrawal of 1000 sats from Ganamos!',
  '2025-07-25 08:50:27.448612+00',
  '2025-07-25 08:50:27.648+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '038758f8-beae-42ce-af7c-f4e2629c86bb',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'withdrawal',
  1000,
  'completed',
  NULL,
  'lnbc10u1p5gx3vppp5sjyunendgm8kzc65lzcx6g3m3xk6jp6n7er5l8zacw3ugqthtdeqdp0f35kw6r5de5kueeqv3jhqmmnd96zqvpwxqcrqvp3ypp9gsccqzzsxqrrssrzjqvphmsywntrrhqjcraumvc4y6r8v4z5v593trte429v4hredj7ms5rdxngqqgecqqyqqqqqqqqqqqqqq2qsp5afnz4y38qzf3j7hypjgqu0jwyprwknl3xk6nlfwntdeefp97c2qq9qxpqysgqm6rj2w9czjdz3vcpx2u6ge004s9ld3ahd47m98u9xgl20pmegqlqkhxylgp4fk5wnrufwzuxhurlgan09qp0kk2kzx9s2s36syrpu4gqm2d3px',
  'hInJ5m1Gz2FjVPiwbSI7ia2pB1P2R0+cXcOjxAF3W3I=',
  'Withdrawal of 1000 sats from Ganamos!',
  '2025-07-25 08:52:00.412882+00',
  '2025-07-25 08:52:00.695+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  'a30ffb65-7b97-4082-8b2c-e6213b4a1954',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'withdrawal',
  1000,
  'failed',
  NULL,
  'lnbc10u1p5gx3vppp5sjyunendgm8kzc65lzcx6g3m3xk6jp6n7er5l8zacw3ugqthtdeqdp0f35kw6r5de5kueeqv3jhqmmnd96zqvpwxqcrqvp3ypp9gsccqzzsxqrrssrzjqvphmsywntrrhqjcraumvc4y6r8v4z5v593trte429v4hredj7ms5rdxngqqgecqqyqqqqqqqqqqqqqq2qsp5afnz4y38qzf3j7hypjgqu0jwyprwknl3xk6nlfwntdeefp97c2qq9qxpqysgqm6rj2w9czjdz3vcpx2u6ge004s9ld3ahd47m98u9xgl20pmegqlqkhxylgp4fk5wnrufwzuxhurlgan09qp0kk2kzx9s2s36syrpu4gqm2d3px',
  NULL,
  'Withdrawal of 1000 sats from Ganamos!',
  '2025-07-25 08:55:16.339549+00',
  '2025-07-25 08:55:16.627+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '5f87051e-6138-4b79-ab3c-03091da2a796',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'withdrawal',
  1000,
  'failed',
  NULL,
  'lnbc10u1p5gx3vppp5sjyunendgm8kzc65lzcx6g3m3xk6jp6n7er5l8zacw3ugqthtdeqdp0f35kw6r5de5kueeqv3jhqmmnd96zqvpwxqcrqvp3ypp9gsccqzzsxqrrssrzjqvphmsywntrrhqjcraumvc4y6r8v4z5v593trte429v4hredj7ms5rdxngqqgecqqyqqqqqqqqqqqqqq2qsp5afnz4y38qzf3j7hypjgqu0jwyprwknl3xk6nlfwntdeefp97c2qq9qxpqysgqm6rj2w9czjdz3vcpx2u6ge004s9ld3ahd47m98u9xgl20pmegqlqkhxylgp4fk5wnrufwzuxhurlgan09qp0kk2kzx9s2s36syrpu4gqm2d3px',
  NULL,
  'Withdrawal of 1000 sats from Ganamos!',
  '2025-07-25 16:35:52.569109+00',
  '2025-07-25 16:35:53.287+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  'ebfe5a58-5b30-4847-8041-e666e8dd44b1',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'withdrawal',
  1000,
  'completed',
  NULL,
  'lnbc1p5g8va7pp5wr9d4r56syrhh9hy037fssx2d3esve5c4fghwgg27vshaxh3uglqdp9f35kw6r5de5kueeqv3jhqmmnd96zqvpqgf2yxcqzzsxqrrssrzjqvphmsywntrrhqjcraumvc4y6r8v4z5v593trte429v4hredj7ms5rpeeqqqt9cqqyqqqqqqqqqqqqqq2qrzjqvphmsywntrrhqjcraumvc4y6r8v4z5v593trte429v4hredj7ms5rdxngqqgecqqyqqqqqqqqqqqqqq2qrzjqw4t06fjwutwa9rt37l6uqumpku9x4j5neevtn9pz04x0zfapqs72r9kdyqqvcsqqyqqqqqqqqqqqqqq2qsp5z62vcwzcsdydqjlq23ffdz4gn4j9q34zy38puwq6dyey3ufxd9hs9qxpqysgq3g49rvqjmmsewjq4z2jr49s56a30v3rp7l7zn5efflpsa7w2p3w5gayql4puzx9av33pnd7a5pfpqxywwad4shuxynkgvm9pz30tlrspzj75n6',
  'cMrajpqBB3uW5Hx8mEDKbHMGZpiqUXchCvMhfprx4j4=',
  'Withdrawal of 1000 sats from Ganamos!',
  '2025-07-25 16:42:01.89581+00',
  '2025-07-25 16:42:03.855+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '479f43ca-d82f-4bc2-af56-336fd203a34e',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'withdrawal',
  1000,
  'failed',
  NULL,
  'lnbc1p5g8va7pp5wr9d4r56syrhh9hy037fssx2d3esve5c4fghwgg27vshaxh3uglqdp9f35kw6r5de5kueeqv3jhqmmnd96zqvpqgf2yxcqzzsxqrrssrzjqvphmsywntrrhqjcraumvc4y6r8v4z5v593trte429v4hredj7ms5rpeeqqqt9cqqyqqqqqqqqqqqqqq2qrzjqvphmsywntrrhqjcraumvc4y6r8v4z5v593trte429v4hredj7ms5rdxngqqgecqqyqqqqqqqqqqqqqq2qrzjqw4t06fjwutwa9rt37l6uqumpku9x4j5neevtn9pz04x0zfapqs72r9kdyqqvcsqqyqqqqqqqqqqqqqq2qsp5z62vcwzcsdydqjlq23ffdz4gn4j9q34zy38puwq6dyey3ufxd9hs9qxpqysgq3g49rvqjmmsewjq4z2jr49s56a30v3rp7l7zn5efflpsa7w2p3w5gayql4puzx9av33pnd7a5pfpqxywwad4shuxynkgvm9pz30tlrspzj75n6',
  NULL,
  'Withdrawal of 1000 sats from Ganamos!',
  '2025-07-25 16:45:27.497937+00',
  '2025-07-25 16:45:27.696+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '5e02854f-4e1a-4b50-af69-b38acf43a86b',
  'ce210e13-15c9-467b-b86e-6768dbdc3bca',
  'internal',
  -2000,
  'completed',
  NULL,
  NULL,
  NULL,
  'Transfer to @brian-murray: love you',
  '2025-10-03 18:23:21.901896+00',
  '2025-10-03 18:23:21.901896+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '584dbc49-41c0-455c-bab4-3148c275bb8a',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'internal',
  2000,
  'completed',
  NULL,
  NULL,
  NULL,
  'Transfer from @Annie: love you',
  '2025-10-03 18:23:21.901896+00',
  '2025-10-03 18:23:21.901896+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  'f026bd7e-6e99-424f-9464-2c6071c5d561',
  'ce210e13-15c9-467b-b86e-6768dbdc3bca',
  'internal',
  -300,
  'completed',
  NULL,
  NULL,
  NULL,
  'Transfer to @brian-murray: buzz?',
  '2025-10-09 16:52:02.798304+00',
  '2025-10-09 16:52:02.798304+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  'e0201a3e-26bf-42f2-8238-aea6dc4cc53a',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'internal',
  300,
  'completed',
  NULL,
  NULL,
  NULL,
  'Transfer from @Annie: buzz?',
  '2025-10-09 16:52:02.798304+00',
  '2025-10-09 16:52:02.798304+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '181d0ff8-e135-4620-9e6a-35ce5a91cb78',
  'ce210e13-15c9-467b-b86e-6768dbdc3bca',
  'internal',
  -333,
  'completed',
  NULL,
  NULL,
  NULL,
  'Transfer to @brian-murray: hi kids!',
  '2025-10-12 14:38:11.669107+00',
  '2025-10-12 14:38:11.669107+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  'a3367581-7a91-40e3-82e1-e334817e8af3',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'internal',
  333,
  'completed',
  NULL,
  NULL,
  NULL,
  'Transfer from @Annie: hi kids!',
  '2025-10-12 14:38:11.669107+00',
  '2025-10-12 14:38:11.669107+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '0b6f7fa6-c6aa-41fd-b5e6-3f732c340d0d',
  'ce210e13-15c9-467b-b86e-6768dbdc3bca',
  'internal',
  -300,
  'completed',
  NULL,
  NULL,
  NULL,
  'Transfer to @brian-murray: mar and brynn',
  '2025-10-12 14:40:03.092211+00',
  '2025-10-12 14:40:03.092211+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '079b4bf9-333e-4085-a670-1a06f3b3d37f',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'internal',
  300,
  'completed',
  NULL,
  NULL,
  NULL,
  'Transfer from @Annie: mar and brynn',
  '2025-10-12 14:40:03.092211+00',
  '2025-10-12 14:40:03.092211+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  'cc282c78-1646-4224-bfa4-e2613e54e96b',
  'ce210e13-15c9-467b-b86e-6768dbdc3bca',
  'internal',
  -300,
  'completed',
  NULL,
  NULL,
  NULL,
  'Transfer to @brian-murray: Mobile',
  '2025-10-12 14:42:27.120136+00',
  '2025-10-12 14:42:27.120136+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  'b8a0458d-484e-42b2-84ff-2cf74b426b29',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'internal',
  300,
  'completed',
  NULL,
  NULL,
  NULL,
  'Transfer from @Annie: Mobile',
  '2025-10-12 14:42:27.120136+00',
  '2025-10-12 14:42:27.120136+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '9ac3d494-afcc-490d-9aee-f10272658ca9',
  'ce210e13-15c9-467b-b86e-6768dbdc3bca',
  'internal',
  -300,
  'completed',
  NULL,
  NULL,
  NULL,
  'Transfer to @brian-murray: L',
  '2025-10-12 14:47:46.301338+00',
  '2025-10-12 14:47:46.301338+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  'e2a3a458-464f-4920-bde8-9d96c57daae8',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'internal',
  300,
  'completed',
  NULL,
  NULL,
  NULL,
  'Transfer from @Annie: L',
  '2025-10-12 14:47:46.301338+00',
  '2025-10-12 14:47:46.301338+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  'f1fd3214-8da7-4d60-a0d2-b9828b371a6b',
  'ce210e13-15c9-467b-b86e-6768dbdc3bca',
  'internal',
  -300,
  'completed',
  NULL,
  NULL,
  NULL,
  'Transfer to @brian-murray: Mama',
  '2025-10-13 01:29:59.093185+00',
  '2025-10-13 01:29:59.093185+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '07027d4c-7403-4253-b17b-04426f03df98',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'internal',
  300,
  'completed',
  NULL,
  NULL,
  NULL,
  'Transfer from @Annie: Mama',
  '2025-10-13 01:29:59.093185+00',
  '2025-10-13 01:29:59.093185+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '9236ab3d-34a1-4b59-a1cd-0450a19b873f',
  'd60a269f-b1a9-4030-96d5-7ddc3ca5e369',
  'internal',
  -300,
  'completed',
  NULL,
  NULL,
  NULL,
  'Transfer to @brian-murray: I love brynn',
  '2025-10-13 01:30:46.235406+00',
  '2025-10-13 01:30:46.235406+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '76e95bd8-fe73-43d6-9362-d0e111792d1a',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'internal',
  300,
  'completed',
  NULL,
  NULL,
  NULL,
  'Transfer from @Marlowe: I love brynn',
  '2025-10-13 01:30:46.235406+00',
  '2025-10-13 01:30:46.235406+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '30999fcb-2e07-46ae-a4f1-f56d7fcc1e4b',
  'd60a269f-b1a9-4030-96d5-7ddc3ca5e369',
  'internal',
  -300,
  'completed',
  NULL,
  NULL,
  NULL,
  'Transfer to @brian-murray: Love daddy',
  '2025-10-15 10:18:17.20454+00',
  '2025-10-15 10:18:17.20454+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '41d3d28c-ba4c-4856-a6a1-a0ce9b3352af',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'internal',
  300,
  'completed',
  NULL,
  NULL,
  NULL,
  'Transfer from @Marlowe: Love daddy',
  '2025-10-15 10:18:17.20454+00',
  '2025-10-15 10:18:17.20454+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '6847d307-7056-408e-8814-49912033ecc3',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'internal',
  333,
  'completed',
  NULL,
  NULL,
  NULL,
  'Transfer from @Marlowe: Daddy',
  '2025-10-15 10:26:14.911011+00',
  '2025-10-15 10:26:14.911011+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  'ab1bf41c-a462-4ade-87b4-5cc51a5d6e27',
  'd60a269f-b1a9-4030-96d5-7ddc3ca5e369',
  'internal',
  -300,
  'completed',
  NULL,
  NULL,
  NULL,
  'Transfer to @brian-murray',
  '2025-10-15 10:59:47.470931+00',
  '2025-10-15 10:59:47.470931+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  'f5ade4bf-2b42-4b8b-b5fb-834ca4b8fc31',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'internal',
  300,
  'completed',
  NULL,
  NULL,
  NULL,
  'Transfer from @Marlowe',
  '2025-10-15 10:59:47.470931+00',
  '2025-10-15 10:59:47.470931+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  'a6f776a3-7584-4617-ad2c-4fdaab154755',
  'a6c07129-6f99-4bdd-ba12-b1756f681af6',
  'internal',
  -100,
  'completed',
  NULL,
  NULL,
  NULL,
  'Transfer to @brian-murray',
  '2025-10-16 01:00:20.503997+00',
  '2025-10-16 01:00:20.503997+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '6be2a59a-eca9-4b50-9a25-707c23714bc9',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'internal',
  100,
  'completed',
  NULL,
  NULL,
  NULL,
  'Transfer from @Brynn',
  '2025-10-16 01:00:20.503997+00',
  '2025-10-16 01:00:20.503997+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '15b217c5-6787-4ce5-9aad-3452ce0bab22',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'internal',
  -333,
  'completed',
  NULL,
  NULL,
  NULL,
  'Transfer to @annie-murray: I love you ',
  '2025-10-17 03:31:48.688341+00',
  '2025-10-17 03:31:48.688341+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '71fab820-7487-460b-b396-702d5f498b86',
  'ce210e13-15c9-467b-b86e-6768dbdc3bca',
  'internal',
  333,
  'completed',
  NULL,
  NULL,
  NULL,
  'Transfer from @Brian: I love you ',
  '2025-10-17 03:31:48.688341+00',
  '2025-10-17 03:31:48.688341+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '1bf933c4-8f70-491e-a817-707771c67d4e',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'deposit',
  10000,
  'pending',
  'd9b06c7c3371faa8eba1b7948c797227daac2c4ad36ae91876644d4ee35a8ca6',
  'lnbc100u1p50rw9upp5mxcxclpnw8a236apk72gc7tjyld2ctz26d4wjxrkv3x5ac663jnqdpsg3jhqmmnd96zqvfsxqcrqgrnv968xgr5dusywctwv9kk7uepcqzzsxqrrsssp5gasxgjzsp2cuuasl5mgayz49dumn9fl736j9nja54mwjrss0834s9qxpqysgq4sralgjkzfa2gt9hk6r5jhq7aa7j50ad8w4hnqh6dvy6t2wdyrzq8ns2hkyfqkxtqy89pzw7ez4a22plv5fet5kgq3g6lt07r3xx5gqpxw77cx',
  NULL,
  'Deposit 10000 sats to Ganamos!',
  '2025-10-17 03:32:12.430513+00',
  '2025-10-17 03:32:12.430513+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '753a1a41-b06c-491c-ad13-00f4758dbe7b',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'withdrawal',
  500,
  'completed',
  NULL,
  'lnbc1p5g8d97pp5cusrhx2mk0nd8sqgxp7n9sx0e9adnu0e63yc69xvdpqxg3sz98tsdp9f35kw6r5de5kueeqv3jhqmmnd96zqvpqgf2yxcqzzsxqrrssrzjqw4t06fjwutwa9rt37l6uqumpku9x4j5neevtn9pz04x0zfapqs72r9kdyqqvcsqqyqqqqqqqqqqqqqq2qrzjqvphmsywntrrhqjcraumvc4y6r8v4z5v593trte429v4hredj7ms5rdxngqqgecqqyqqqqqqqqqqqqqq2qrzjqvphmsywntrrhqjcraumvc4y6r8v4z5v593trte429v4hredj7ms5rpeeqqqt9cqqyqqqqqqqqqqqqqq2qsp5dp5l9g5f6pdmpw58ptlg3cdyl4kjuyx8aewsttp08fwxmesxfaps9qxpqysgqrpejmnzz9mhr6vsv0k4ts8yzfzwfaqnptdkecmc3mnt50c5sfc6xqpsz77uq78gq7jefsf2rekx2vljckuxmqpkdj0al6dktrm397asqwjj80v',
  'xyA7mVuz5tPACDB9MsDPyXrZ8fnUSY0UzGhAZEYCKdc=',
  'Withdrawal of 500 sats from Ganamos!',
  '2025-07-25 16:47:10.699386+00',
  '2025-07-25 16:47:12.147+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  'af0dacca-3a93-4fe3-a144-c1b06a53851f',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'withdrawal',
  500,
  'failed',
  NULL,
  'lnbc1p5g8d97pp5cusrhx2mk0nd8sqgxp7n9sx0e9adnu0e63yc69xvdpqxg3sz98tsdp9f35kw6r5de5kueeqv3jhqmmnd96zqvpqgf2yxcqzzsxqrrssrzjqw4t06fjwutwa9rt37l6uqumpku9x4j5neevtn9pz04x0zfapqs72r9kdyqqvcsqqyqqqqqqqqqqqqqq2qrzjqvphmsywntrrhqjcraumvc4y6r8v4z5v593trte429v4hredj7ms5rdxngqqgecqqyqqqqqqqqqqqqqq2qrzjqvphmsywntrrhqjcraumvc4y6r8v4z5v593trte429v4hredj7ms5rpeeqqqt9cqqyqqqqqqqqqqqqqq2qsp5dp5l9g5f6pdmpw58ptlg3cdyl4kjuyx8aewsttp08fwxmesxfaps9qxpqysgqrpejmnzz9mhr6vsv0k4ts8yzfzwfaqnptdkecmc3mnt50c5sfc6xqpsz77uq78gq7jefsf2rekx2vljckuxmqpkdj0al6dktrm397asqwjj80v',
  NULL,
  'Withdrawal of 500 sats from Ganamos!',
  '2025-07-25 16:48:11.164196+00',
  '2025-07-25 16:48:11.325+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '8a0065bc-1850-4a39-852a-04acacb67c54',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'withdrawal',
  500,
  'completed',
  NULL,
  'lnbc1p5g8dtqpp5a9dygp29fyq76vdydp4mcymjwj0j5zqmna5qdtq32dp664m052nsdp9f35kw6r5de5kueeqv3jhqmmnd96zqvpqgf2yxcqzzsxqrrssrzjqw4t06fjwutwa9rt37l6uqumpku9x4j5neevtn9pz04x0zfapqs72r9kdyqqvcsqqyqqqqqqqqqqqqqq2qrzjqvphmsywntrrhqjcraumvc4y6r8v4z5v593trte429v4hredj7ms5rdxngqqgecqqyqqqqqqqqqqqqqq2qrzjqvphmsywntrrhqjcraumvc4y6r8v4z5v593trte429v4hredj7ms5rpeeqqqt9cqqyqqqqqqqqqqqqqq2qsp5fychyre8l79ry7aaq79mfjqn66c8k8906hn8fvgjsyjjky38wqrs9qxpqysgqlt3lpk87cvplks4qmkcscxqkq6vfksp6h5c24m4gpm2t9zwt4h7ppt5lh9v8qdn5g7tp2zpmk7u3q8tup4nkjew5tv533706h6cktfqq0grsr9',
  '6VpEBUVJAe0xpGhrvBNydJ8qCBufaAasEVNDrVdvoqc=',
  'Withdrawal of 500 sats from Ganamos!',
  '2025-07-25 16:48:47.52174+00',
  '2025-07-25 16:48:48.919+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  'e0dfc37e-96d5-4b8a-9fb1-ac7e7fe60167',
  '46b5c08a-34a6-42f9-b2bb-3d47a1193cc9',
  'deposit',
  1000,
  'completed',
  '9f21be0c31140ffd7a2e982fcb6057316b57510124c4ae20dcb6486fb749d56b',
  'lnbc10u1p5gfehzpp5nusmurp3zs8l673wnqhukczhx944w5gpynz2ugxukeyxld6f644sdp0g3jhqmmnd96zqvfsxqczqumpw3ejqar0yprkzmnpd4hhxggcqzzsxqrrsssp5ek2dfuy0l0ls3q0c04j6q7nezw4qk96e59hjpc02lm9f3ndysjjq9qxpqysgqczlfztse7stgy4yx670tj2tpdl8xcljhjdgjfnupz7a7mr8wqek99d8nejmw03yrztgfem6jmvk7j42qyq96xvfzw2q3mgwp36jns5sq765mym',
  NULL,
  'Deposit 1000 sats to Ganamos!',
  '2025-07-26 14:32:02.400879+00',
  '2025-07-26 14:32:18.237+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  'e46c613f-f199-4715-8f7f-734f5365774c',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'withdrawal',
  333,
  'completed',
  NULL,
  'lnbc1p5gtv9epp5f84fl0f7wrmevdse42m3taxghuuqywjvet8hljc23dd3uyaj6fhsdp9f35kw6r5de5kueeqv3jhqmmnd96zqvpqgf2yxcqzzsxqrrssrzjqw4t06fjwutwa9rt37l6uqumpku9x4j5neevtn9pz04x0zfapqs72r9kdyqqvcsqqyqqqqqqqqqqqqqq2qrzjqvphmsywntrrhqjcraumvc4y6r8v4z5v593trte429v4hredj7ms5rpeeqqqt9cqqyqqqqqqqqqqqqqq2qrzjqvphmsywntrrhqjcraumvc4y6r8v4z5v593trte429v4hredj7ms5rdxngqqgecqqyqqqqqqqqqqqqqq2qsp5nzwt4xeh7u8kcv6k6vxuuszpr2cx8v3lg64mhvcqxa2m25x8tllq9qxpqysgq7p4vxh84ec2t7h859w6k32sjtzca7rv5gvhcdhnj2vxz69jjfkwk26jd5utsaagq52meg7z9m9dnr878kanqvykmlknfrkemhzhhe5qpxzzvw4',
  'SeqfvT5w95Y2Gaq3FfTIvzgCOkzKz3/LCotbHhOy0m8=',
  'Withdrawal of 333 sats from Ganamos!',
  '2025-07-27 04:54:30.166392+00',
  '2025-07-27 04:54:31.953+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '579c0900-b97d-424b-8140-02624835da3b',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'withdrawal',
  3,
  'completed',
  NULL,
  'lnbc1p5gtvczpp53eruuk8l945p7zfv4zmpdly2vxc78x0vj0484lv7awnq7luh26rqdp9f35kw6r5de5kueeqv3jhqmmnd96zqvpqgf2yxcqzzsxqrrssrzjqw4t06fjwutwa9rt37l6uqumpku9x4j5neevtn9pz04x0zfapqs72r9kdyqqvcsqqyqqqqqqqqqqqqqq2qrzjqvphmsywntrrhqjcraumvc4y6r8v4z5v593trte429v4hredj7ms5rpeeqqqt9cqqyqqqqqqqqqqqqqq2qrzjqvphmsywntrrhqjcraumvc4y6r8v4z5v593trte429v4hredj7ms5rdxngqqgecqqyqqqqqqqqqqqqqq2qsp5hvz0s3gcv862d7par9d0kjfcs3sq8e0encwheph38fhj70dp79dq9qxpqysgq4zr45afs8yceg9jmapz3ef0907y8ksh2shk4ujvgy92er0x08tjpcn0tss0phdgml2plzuuv3y96ulhhkath3phrdvkpm4pl7u7ppecqgxwa9z',
  'jkfOWP8taB8JLKi2FvyKYbHjmeyT6nr9nuumD3+XVoY=',
  'Withdrawal of 3 sats from Ganamos!',
  '2025-07-27 05:03:25.165044+00',
  '2025-07-27 05:03:26.565+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  'ff51e605-e7a9-4b23-b323-42b8ea462b75',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'deposit',
  15000,
  'completed',
  '80ea48827158aa173f4b991dac171cbd385bec166c538ed21adbb0566b16430b',
  'lnbc150u1p52yxptpp5sr4y3qn3tz4pw06tnyw6c9cuh5u9hmqkd3fca5s6mwc9v6ckgv9sdpsg3jhqmmnd96zqvf4xqcrqgrnv968xgr5dusywctwv9kk7uepcqzzsxqrrsssp5ldr5w0maef789w2rflxsn4afda2pdzmttkhxf25zpxj765se82js9qxpqysgqx5kt5q4dld9ydgxfsqtuumrfh2hjqngllhg4f34vyv7crsdx4g6ja7stwxsuj25pvd40akh3xxxvce95xg49gklx5d69es93j6f02aqqzaktz9',
  NULL,
  'Deposit 15000 sats to Ganamos!',
  '2025-08-17 17:58:04.043912+00',
  '2025-08-17 17:58:35.167+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '35e8f134-0e59-4fc6-a555-877920eb6888',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'internal',
  -333,
  'completed',
  NULL,
  NULL,
  NULL,
  'Transfer to Kittle',
  '2025-09-30 21:48:06.617974+00',
  '2025-09-30 21:48:06.617974+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '3600ea9b-0ad8-4a08-9eff-5cbd5e0af857',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'internal',
  -200,
  'completed',
  NULL,
  NULL,
  NULL,
  'Transfer to Kittle',
  '2025-09-30 22:20:25.520266+00',
  '2025-09-30 22:20:25.520266+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '3a998cb4-f371-4a31-b0c5-b59120d8f6e9',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'internal',
  -20,
  'completed',
  NULL,
  NULL,
  NULL,
  'Transfer to Brynn',
  '2025-09-30 22:21:15.664566+00',
  '2025-09-30 22:21:15.664566+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '36ccbe7b-9fc6-4291-b20a-2e8042b12505',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'internal',
  -200,
  'completed',
  NULL,
  NULL,
  NULL,
  'Transfer to Kittle',
  '2025-09-30 22:28:10.782647+00',
  '2025-09-30 22:28:10.782647+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  'd3f0b0db-0865-4ebe-b33c-ddb36f0dd23b',
  'a48208e9-183d-4ffc-af54-4d9a0ceb0a44',
  'internal',
  200,
  'completed',
  NULL,
  NULL,
  NULL,
  'Transfer from Brian',
  '2025-09-30 22:28:10.782647+00',
  '2025-09-30 22:28:10.782647+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '021ce746-0570-46fc-b187-a1891933ee83',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'internal',
  -200,
  'completed',
  NULL,
  NULL,
  NULL,
  'Transfer to Kittle',
  '2025-09-30 22:28:20.007939+00',
  '2025-09-30 22:28:20.007939+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '190df4c9-72b3-488f-927c-19cb02926410',
  'a48208e9-183d-4ffc-af54-4d9a0ceb0a44',
  'internal',
  200,
  'completed',
  NULL,
  NULL,
  NULL,
  'Transfer from Brian',
  '2025-09-30 22:28:20.007939+00',
  '2025-09-30 22:28:20.007939+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  'e7521a75-62bc-4b77-a46a-ea4af52f25da',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'internal',
  -200,
  'completed',
  NULL,
  NULL,
  NULL,
  'Transfer to Kittle',
  '2025-09-30 22:28:29.767727+00',
  '2025-09-30 22:28:29.767727+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '347c7891-af24-43fe-aa9f-ff216875c655',
  'a48208e9-183d-4ffc-af54-4d9a0ceb0a44',
  'internal',
  200,
  'completed',
  NULL,
  NULL,
  NULL,
  'Transfer from Brian',
  '2025-09-30 22:28:29.767727+00',
  '2025-09-30 22:28:29.767727+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '9f974916-511b-419c-b98b-445d74b5063b',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'internal',
  -333,
  'completed',
  NULL,
  NULL,
  NULL,
  'Transfer to Brynn',
  '2025-09-30 22:35:52.021784+00',
  '2025-09-30 22:35:52.021784+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  'd456d046-e922-4402-9867-fa43ec77319f',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'internal',
  -33,
  'completed',
  NULL,
  NULL,
  NULL,
  'Transfer to Marlowe',
  '2025-10-01 02:00:25.885542+00',
  '2025-10-01 02:00:25.885542+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  'ab9d064a-1769-45e0-aa58-de8209498880',
  'd60a269f-b1a9-4030-96d5-7ddc3ca5e369',
  'internal',
  33,
  'completed',
  NULL,
  NULL,
  NULL,
  'Transfer from Brian',
  '2025-10-01 02:00:25.885542+00',
  '2025-10-01 02:00:25.885542+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  'b8e67203-df7b-492f-9f2b-7cce99c94db3',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'internal',
  -30,
  'completed',
  NULL,
  NULL,
  NULL,
  'Transfer to Marlowe: Cleaning up your room ',
  '2025-10-01 02:59:14.317489+00',
  '2025-10-01 02:59:14.317489+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  'b992efc2-66dd-462a-98a4-91621c0104f1',
  'd60a269f-b1a9-4030-96d5-7ddc3ca5e369',
  'internal',
  30,
  'completed',
  NULL,
  NULL,
  NULL,
  'Transfer from Brian: Cleaning up your room ',
  '2025-10-01 02:59:14.317489+00',
  '2025-10-01 02:59:14.317489+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '56ffa356-28bf-4979-a693-f2ec30c11407',
  'ce210e13-15c9-467b-b86e-6768dbdc3bca',
  'internal',
  -1000,
  'completed',
  NULL,
  NULL,
  NULL,
  'Transfer to @brian-murray',
  '2025-10-01 08:03:08.888361+00',
  '2025-10-01 08:03:08.888361+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '843c0137-2606-4f2a-a975-fb1db3255f40',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'internal',
  1000,
  'completed',
  NULL,
  NULL,
  NULL,
  'Transfer from @Annie',
  '2025-10-01 08:03:08.888361+00',
  '2025-10-01 08:03:08.888361+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '7125eec3-259d-4357-91ec-bbb692114f7c',
  'ce210e13-15c9-467b-b86e-6768dbdc3bca',
  'internal',
  -3000,
  'completed',
  NULL,
  NULL,
  NULL,
  'Transfer to @brian-murray',
  '2025-10-01 08:06:44.34109+00',
  '2025-10-01 08:06:44.34109+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '117456ca-a5ef-44a0-b34d-0aae5e66676c',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'internal',
  3000,
  'completed',
  NULL,
  NULL,
  NULL,
  'Transfer from @Annie',
  '2025-10-01 08:06:44.34109+00',
  '2025-10-01 08:06:44.34109+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '9818ea3c-1b56-47c2-b9d9-a299ba3779f2',
  'ce210e13-15c9-467b-b86e-6768dbdc3bca',
  'internal',
  -3000,
  'completed',
  NULL,
  NULL,
  NULL,
  'Transfer to @brian-murray: testing',
  '2025-10-01 08:11:50.272322+00',
  '2025-10-01 08:11:50.272322+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '84842af3-1a46-46b4-8ba9-6189f092a538',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'internal',
  3000,
  'completed',
  NULL,
  NULL,
  NULL,
  'Transfer from @Annie: testing',
  '2025-10-01 08:11:50.272322+00',
  '2025-10-01 08:11:50.272322+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '063325b4-9d32-4d62-8805-007cf0c59cda',
  'ce210e13-15c9-467b-b86e-6768dbdc3bca',
  'internal',
  -3000,
  'completed',
  NULL,
  NULL,
  NULL,
  'Transfer to @brian-murray: weeeee',
  '2025-10-01 08:18:29.292751+00',
  '2025-10-01 08:18:29.292751+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '6e567870-244c-47f5-b0ae-2b3ccf9a45a2',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'internal',
  3000,
  'completed',
  NULL,
  NULL,
  NULL,
  'Transfer from @Annie: weeeee',
  '2025-10-01 08:18:29.292751+00',
  '2025-10-01 08:18:29.292751+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '542b5e14-5382-4524-9206-875227b1f25b',
  'ce210e13-15c9-467b-b86e-6768dbdc3bca',
  'internal',
  -3000,
  'completed',
  NULL,
  NULL,
  NULL,
  'Transfer to @brian-murray: love you',
  '2025-10-01 08:28:48.768324+00',
  '2025-10-01 08:28:48.768324+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '5c689fa3-2509-4ef7-bc14-d5a324cb4179',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'internal',
  -4000,
  'completed',
  NULL,
  NULL,
  NULL,
  'Transfer to @marlowe: I love you',
  '2025-10-18 16:51:15.645865+00',
  '2025-10-18 16:51:15.645865+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '7c571c91-79b1-4ffa-98d3-1525e31feec3',
  'd60a269f-b1a9-4030-96d5-7ddc3ca5e369',
  'internal',
  4000,
  'completed',
  NULL,
  NULL,
  NULL,
  'Transfer from @Brian: I love you',
  '2025-10-18 16:51:15.645865+00',
  '2025-10-18 16:51:15.645865+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '4f2d27f8-6f97-4064-8231-fe48da008894',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'withdrawal',
  100,
  'completed',
  NULL,
  'lnbc1p50t5ctpp53c5cuaydutnxv45l0zrjdw33wlglrm3p4f9h0udqyscggs77ydtsdp9f35kw6r5de5kueeqv3jhqmmnd96zqvpqgf2yxcqzzsxqrrssrzjqw4t06fjwutwa9rt37l6uqumpku9x4j5neevtn9pz04x0zfapqs72r9kdyqqvcsqqyqqqqqqqqqqqqqq2qrzjqvphmsywntrrhqjcraumvc4y6r8v4z5v593trte429v4hredj7ms5rdxngqqgecqqyqqqqqqqqqqqqqq2qrzjqvphmsywntrrhqjcraumvc4y6r8v4z5v593trte429v4hredj7ms5rpeeqqqt9cqqyqqqqqqqqqqqqqq2qsp5tm9a393gj2zqrw2vpg946amjwujw2ha8wx30sekscc85xxu5gx0q9qxpqysgqqtn82yzfhr2pvr9w28fthxgyuqe88k2ljk3evgvlyrhszndllf3qk0jzedyjanfrf6sykxg3gmrf3r9ennelmzsev0jk3zgujn2xjjqqk3cmn8',
  'jimOdI3i5mZWn3iHJroxd9Hx7iGqS3fxoCQwhEPeI1c=',
  'Withdrawal of 100 sats from Ganamos!',
  '2025-10-20 06:13:49.44335+00',
  '2025-10-20 06:13:51.013+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '7294e1a7-5126-422b-970b-037fb3d31c3b',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'deposit',
  0,
  'pending',
  'd98c0cb4e0f3bb21a6b8c1cc8342411c10e0dc1c2bf8d27be26d786b14df822f',
  'lnbc1p50tky2pp5mxxqed8q7wajrf4cc8xgxsjprsgwphqu90udy7lzd4uxk9xlsghsdp2g3jhqmmnd96zqvpqwdshgueqw3hjq3mpdesk6mmnyycqzzsxqrrsssp56nusp6tshq952yhqzj6aqnfhaceq0e45a74k6936k06u6svlpd6s9qxpqysgqhlx9d9r6dpp88mtet5uypavtmeyce6y8k290968xd0hlrq95jhzkgqxh54640cq344727ztdmcldvyqpaeq3xkv3tg3y0wvlw5jvhpcpx3t308',
  NULL,
  'Deposit 0 sats to Ganamos!',
  '2025-10-20 06:36:58.575104+00',
  '2025-10-20 06:36:58.575104+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  'c3954d51-af32-4315-9597-907e5b38f9bb',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'deposit',
  0,
  'pending',
  '1d0a930e83d834a32172158fcc44f83d560de0ba754ffbbd042c4c456e0c39f7',
  'lnbc1p50tkt0pp5r59fxr5rmq62xgtjzk8uc38c84tqmc96w48lh0gy93xy2msv88msdp2g3jhqmmnd96zqvpqwdshgueqw3hjq3mpdesk6mmnyycqzzsxqrrsssp5l2jqfrr330ahtmpkacp9dxmu0q3qawus9ffpplewkfhul4z5rx8s9qxpqysgq93p3yvyfmrrx8ytvq9pya0w7hyy3rc82gc5yerz85n65sylswjws8qs8qagrx57273n29yvdt5q5wgelyp76m946tjezw6juv3g9lssqa40vn4',
  NULL,
  'Deposit 0 sats to Ganamos!',
  '2025-10-20 06:40:47.809339+00',
  '2025-10-20 06:40:47.809339+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  'bd92af32-d76b-4e30-9119-64504b6374b9',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'deposit',
  0,
  'pending',
  'd1250937ff24b48fe828d672bc4150bb30d116b332b986feeece00dfe7357996',
  'lnbc1p50tkvmpp56yjsjdllyj6gl6pg6eetcs2shvcdz94nx2ucdlhwecqdlee40xtqdp2g3jhqmmnd96zqvpqwdshgueqw3hjq3mpdesk6mmnyycqzzsxqrrsssp5r9at8d4pwavx39cytrzp2c6wxnxeasm9u7ywcll6ycc36cc7qegq9qxpqysgqpakcan3vy4zudw7j4qgvfsgnqm7yg7v0cyzu25v0wp0hade7h8g85c94hut63l7wmc6p69kcnmt4wu0mgruhrjcec0q202hrk4hfq3qqrlwuke',
  NULL,
  'Deposit 0 sats to Ganamos!',
  '2025-10-20 06:41:32.118473+00',
  '2025-10-20 06:41:32.118473+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  'fd6cf3be-a43e-401c-a8ad-7fdf15d09298',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'deposit',
  0,
  'pending',
  '811b56e6d22b5dc6a549a3da3c695bd912c37da2bffdf14eaaf94fd1b212d01b',
  'lnbc1p50tksapp5syd4dekj9dwudf2f50drc62mmyfvxldzhl7lzn42l98arvsj6qdsdp2g3jhqmmnd96zqvpqwdshgueqw3hjq3mpdesk6mmnyycqzzsxqrrsssp5xtzkvkvqmtsd023hcgpukd5k2yxuh0s4kmftwrjwn98zl2wzuxks9qxpqysgq4js6xs2g8j5f2wau6mwhatlqwnu5ev4qa24z622nu3ntpxynu44hcd6vy0y8kj6lsl5wn4y2unnmgxk8hll2sa5dg4tu3w66spzv99cqxxx7ml',
  NULL,
  'Deposit 0 sats to Ganamos!',
  '2025-10-20 06:43:41.245567+00',
  '2025-10-20 06:43:41.245567+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  'd70bb3ca-7ad2-4efc-9e71-17c68996999b',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'deposit',
  0,
  'pending',
  '7d362ad8f2868a381600beab1e5151f1443731b4aac0a98db883b6ee1bcf45ad',
  'lnbc1p50tk4lpp505mz4k8js69rs9sqh643u52379zrwvd54tq2nrdcswmwux70gkksdp2g3jhqmmnd96zqvpqwdshgueqw3hjq3mpdesk6mmnyycqzzsxqrrsssp5jvjedz5zt726ljcy0mzqlxg2e08cvjuqu2768l5ker9kppfn7u2s9qxpqysgqc7dhzj770r4s9tsjpgd8ermy7rzf8m63zpkhcwj33mxz2els63y40ypfxwq3jjp95g5cxcc67xc6s89fgcvcqpdk5yar9cd7phv0q6cq6mcel7',
  NULL,
  'Deposit 0 sats to Ganamos!',
  '2025-10-20 06:46:23.355366+00',
  '2025-10-20 06:46:23.355366+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  'a55dfda7-d0c5-49ea-b3ef-61040092da65',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'deposit',
  0,
  'pending',
  '8d589bef65b278e770d21269d302b795d60f69a7bd69d6fb09685d0c7b456271',
  'lnbc1p50thawpp534vfhmm9kfuwwuxjzf5axq4hjhtq76d8h45ad7cfdpwsc769vfcsdp2g3jhqmmnd96zqvpqwdshgueqw3hjq3mpdesk6mmnyycqzzsxqrrsssp5n6eegyp85lfaapcc50vf6wyky23zvwvj43z7zvhffcszd6ed4w4q9qxpqysgq92wvkcqsvdkv7d5080wsc52ph6grtepp39sy2v7sq5ejkzrtfzw58vefv9wt9p3uzhcs9ylekqp466g96qlcylmu3es2zykk8sh93csqljar5r',
  NULL,
  'Deposit 0 sats to Ganamos!',
  '2025-10-20 07:07:27.031461+00',
  '2025-10-20 07:07:27.031461+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '8050e3f4-1f87-432d-ac4f-ae9d481a32df',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'deposit',
  0,
  'pending',
  '4f2335ada9d7d522aebbc89c711ce27bc157996d780e7bc47a49efbb43e00278',
  'lnbc1p50tls9pp5fu3nttdf6l2j9t4mezw8z88z00q40xtd0q88h3r6f8hmkslqqfuqdp2g3jhqmmnd96zqvpqwdshgueqw3hjq3mpdesk6mmnyycqzzsxqrrsssp5gq8g96r0a35kv6n6vkfdhp7emtcdnhl7vq4y6dtmc4g0wgg7530q9qxpqysgq7ypmjxaz4emf23xzk64qgd6zmvevvyhu25gtag3k2qhaw4l86a9p7nskvcxdnpkqg9fcyttstepztkxzzldhl33saleypm6975rag5cpjtkwdt',
  NULL,
  'Deposit 0 sats to Ganamos!',
  '2025-10-20 09:16:53.99398+00',
  '2025-10-20 09:16:53.99398+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '43c14431-bbd5-44ae-824f-f24d10e6f45b',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'deposit',
  0,
  'completed',
  'a5b79d7309e50460ad1fc8e7a1a9887e633d0187092bb64b57c777bf3b71c06b',
  'lnbc1p50w5hrpp55kme6ucfu5zxptglern6r2vg0e3n6qv8py4mvj6hcamm7wm3cp4sdp2g3jhqmmnd96zqvpqwdshgueqw3hjq3mpdesk6mmnyycqzzsxqrrsssp5n2l8vj2ujwjnk6fngu95wdgp5u5puukht40q42p7hcvf84wdgurq9qxpqysgq6gkwstsu0d46x82nfclcxxrjflgvuez42jkyxpeduqvrm2s5qutnnmdz49ktnhexpsms0lkkws34lp3mas20p3l7uttclhvz6665zmcpqerzag',
  NULL,
  'Deposit 0 sats to Ganamos!',
  '2025-10-21 09:31:15.249959+00',
  '2025-10-21 09:32:01.397+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '4bf566ea-afbf-4c37-ad6b-693ca1d09a83',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'deposit',
  0,
  'pending',
  '77760d6f887be6993af0d0180c945a0208061cc0ef3ce130f913930ede24128b',
  'lnbc1p50w5e8pp5wamq6mug00nfjwhs6qvqe9z6qgyqv8xqau7wzv8ezwfsah3yz29sdp2g3jhqmmnd96zqvpqwdshgueqw3hjq3mpdesk6mmnyycqzzsxqrrsssp5rzk7y9tujs5es9pa92nr9gvk7dx52sm9j276jdkvrvumpuehjwvq9qxpqysgqs634sd252yrfhuht4qlhexgd4sa4g0v9dpqz4z0as8p0cyhxhw59swtpn0leesl2sjuzuwqgpwczl70qdsu75tm3amjyp5emgahqt3gqdh3ppw',
  NULL,
  'Deposit 0 sats to Ganamos!',
  '2025-10-21 09:32:23.646103+00',
  '2025-10-21 09:32:23.646103+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  'e25affb6-7c54-4069-ba0e-fc6049834a1e',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'deposit',
  20000,
  'completed',
  '2813125f04f644a0ecd6ab354ad45bc893a071c074ac40b70ac78caaf9512784',
  'lnbc200u1p50w5e0pp59qf3yhcy7ez2pmxk4v6544zmezf6quwqwjkypdc2c7x24723y7zqdpsg3jhqmmnd96zqv3sxqcrqgrnv968xgr5dusywctwv9kk7uepcqzzsxqrrsssp5w6mt82gws506lexs8gujmv0l32t6p2hqrmtz4t533ax9ylemav2s9qxpqysgqu93wscu38aklfkpzrdh5a708wcjx4nqswx6f6q2v4sf4lah7xa9nckd9c665pp387psw0gp5dcvs2dn7g4psjutma7kjra39xg2vnmqq08k09d',
  NULL,
  'Deposit 20000 sats to Ganamos!',
  '2025-10-21 09:32:31.859902+00',
  '2025-10-21 09:33:06.352+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  'a43ef69c-e667-4af1-a553-b58164b5a5a5',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'deposit',
  0,
  'pending',
  'a6b1a4cf081b1bef15c4703b076104d29596339608e4adc169ca0908f549e85e',
  'lnbc1p50w4a8pp556c6fncgrvd779wywqaswcgy622evvukprj2mstfegys3a2fap0qdp2g3jhqmmnd96zqvpqwdshgueqw3hjq3mpdesk6mmnyycqzzsxqrrsssp5skmpawyaa6zl52n5lynqmc5x4ecd75xu2mnlddegx7vmpzcncchq9qxpqysgqtevz78xrtzrqa4dntx33krz0w7mrx3tsv00hcsnuy4k625fx4lm4u2f95e47z4ezfeudycmlqa22qpy79nkaxghff42d56w0h3vdumcqazmge9',
  NULL,
  'Deposit 0 sats to Ganamos!',
  '2025-10-21 09:51:35.618847+00',
  '2025-10-21 09:51:35.618847+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '261ffd00-0063-46f8-8afd-e84aa5edaa35',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'deposit',
  0,
  'pending',
  '921d1e434ea996c5de328420ce5f982719c818da3ad8ceaed7c56f5ad0d2bb90',
  'lnbc1p50w4avpp5jgw3us6w4xtvth3jsssvuhucyuvusxx68tvvatkhc4h445xjhwgqdp2g3jhqmmnd96zqvpqwdshgueqw3hjq3mpdesk6mmnyycqzzsxqrrsssp58a79nv6m7d4yx0l9ltnc0p2ft5hv9m2wecep7t7wpjnvx3klc49q9qxpqysgq0dj0gq3etnuqaac7f9q3dfes2qlgpdzrzhs65zlz35qc7vnkns48l4tecy6nrrjaekq4j8x8xw80cdyg6hwlus92xz4zyxnasa67tdsqvk66lu',
  NULL,
  'Deposit 0 sats to Ganamos!',
  '2025-10-21 09:51:40.625289+00',
  '2025-10-21 09:51:40.625289+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '57cb7a0b-9792-44fe-a260-60dc2fc46048',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'internal',
  -5000,
  'completed',
  NULL,
  NULL,
  NULL,
  'Transfer to @annie: I love you',
  '2025-10-23 11:45:16.837958+00',
  '2025-10-23 11:45:16.837958+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '0e41167a-8003-42b6-bbb4-573fa00e8f5f',
  'ce210e13-15c9-467b-b86e-6768dbdc3bca',
  'internal',
  5000,
  'completed',
  NULL,
  NULL,
  NULL,
  'Transfer from @Brian: I love you',
  '2025-10-23 11:45:16.837958+00',
  '2025-10-23 11:45:16.837958+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  'ee0fcabe-8d4d-4b4d-9e8e-4eca67317d1e',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'deposit',
  100000,
  'completed',
  '589ae07f5dc8a8579f50a2d2647c42bb8b8213ebf263460115e42d24afe6d54c',
  'lnbc1m1p50wkx9pp5tzdwql6aez59086s5tfxglzzhw9cyylt7f35vqg4uskjftlx64xqdpjg3jhqmmnd96zqvfsxqcrqvpqwdshgueqw3hjq3mpdesk6mmnyycqzzsxqrrsssp554946n6n0rkkvmvcumr8u7r8qrr0kfkv98uy2d2nu4gnycr2cmzq9qxpqysgqtyjaaw823kywqm4aft6gpj6r9jxqn7a7pfu5grmfafnjrry05wkknvfndfha4pmpt40zvvdgu82v345m6jfdjev8cplr2g4njenrxucqwldqhv',
  NULL,
  'Deposit 100000 sats to Ganamos!',
  '2025-10-21 09:56:21.174944+00',
  '2025-10-21 09:56:55.659+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  'eadd8783-d687-446c-a6cd-c4c7e49b5637',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'deposit',
  0,
  'pending',
  '8cffe75b420deb6ff636156882de589c08c1d1788d7d2e567519620251e847c2',
  'lnbc1p50wkfwpp53nl7wk6zph4kla3kz45g9hjcnsyvr5tc347ju4n4r93qy50gglpqdp2g3jhqmmnd96zqvpqwdshgueqw3hjq3mpdesk6mmnyycqzzsxqrrsssp542z4d9hpq7m6sdzp034yq25ukuszq9xx5aa9fvn2kqyq3y9xjt6q9qxpqysgqh0twe77wf3rznn5v77jvw7u4f0exwaq5lth6elgg3vjvwax28pwjzp4f5sqc90xp4a8w464uuvrhss55ywe0ts7g0zzs4stc84rwy4sp4h65dq',
  NULL,
  'Deposit 0 sats to Ganamos!',
  '2025-10-21 09:58:06.518218+00',
  '2025-10-21 09:58:06.518218+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '7b723a38-478f-4cd0-b7fb-ba87738bb120',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'deposit',
  0,
  'pending',
  '1fba2dde3131a8881ce1359701aa2b4e9957b7563f1e63c025931146d0b492a5',
  'lnbc1p500twwpp5r7azmh33xx5gs88pxktsr23tf6v40d6k8u0x8sp9jvg5d595j2jsdqlg3jhqmmnd96zqar0yprkzmnpd4hhxggcqzzsxqrrsssp5y86v7avmf6wxrc3w6ue6mulfml4l5kpvv4p7trmku6jhxnuk7z6s9qxpqysgqk3hp4mck90lg8j3wcjhm8cng6gyk6gkgdj8fvkhsz323yfyqqjn5lqnnwjtuyaknj6lzl5rw2tqaga4vrg0tkj2578uj4wuggc80ffsp3s2zcg',
  NULL,
  'Deposit to Ganamos!',
  '2025-10-21 15:59:10.593824+00',
  '2025-10-21 15:59:10.593824+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '3497f3ad-5490-4837-8d4f-d07e9334d3c5',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'deposit',
  0,
  'pending',
  'f03821de56ec314d76ffe587cb3d3dc8ec56b150500177a327a16bfaca482b19',
  'lnbc1p500t0vpp57quzrhjkasc56ahlukruk0faerk9dv2s2qqh0ge8594l4jjg9vvsdqlg3jhqmmnd96zqar0yprkzmnpd4hhxggcqzzsxqrrsssp56nvew5cnxwulzky9wplexj9kq5s3htv86v823qw4z0xetp84flzs9qxpqysgqunnhwfshcvya2mef4hwlcpshknaxsfq3vjnx6t965c0zs54w2qhp7tzryqfsj620v0zkghc8wetad08qjwxzf4esey0jztjf7jucmnspy7f6km',
  NULL,
  'Deposit to Ganamos!',
  '2025-10-21 15:59:41.207448+00',
  '2025-10-21 15:59:41.207448+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '722e5ce6-0484-48ea-818a-d06958588467',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'deposit',
  0,
  'pending',
  '3ec5b7fc6a3deeae97fbc266646832e8dffb3c9e9abf1d14e662bb54debf3c1c',
  'lnbc1p500t0kpp58mzm0lr28hh2a9lmcfnxg6pjar0lk0y7n2l3698xv2a4fh4l8swqdqlg3jhqmmnd96zqar0yprkzmnpd4hhxggcqzzsxqrrsssp5cdff5tgxhjakjh0p98yz26fwn26cr5ypudg9y94tl5gk28a76xhq9qxpqysgqwnzgh2g8gzvke829u0395vrqe0575wu74zxdhnajrd7esy7u6xp5ns0fmfeludj4vdusqgjpcf6c4plm2gjurjmdy6jn5ke2x6nerpspj6a9yj',
  NULL,
  'Deposit to Ganamos!',
  '2025-10-21 15:59:50.652312+00',
  '2025-10-21 15:59:50.652312+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '6b16e1ef-a1ff-4f13-92d9-19c3d9e832ac',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'deposit',
  0,
  'pending',
  '52784c74ccd3713d5c00b0c74171a4f5bbfab6eca249719f62c0753db1396653',
  'lnbc1p500t07pp52fuycaxv6dcn6hqqkrr5zudy7kal4dhv5fyhr8mzcp6nmvfevefsdqlg3jhqmmnd96zqar0yprkzmnpd4hhxggcqzzsxqrrsssp5xhzrvwdg8yx0ahwjl7zykgw0jdesn30sfujxwand4lq6klle7k5q9qxpqysgq6vpwcn49tps7fpg69cxtxmzwhqggr2penkcjczjulqw4xqcnzmlkvdw5j8wlc96g5hdfkl7wejc0mth4ut3gn6txvuxdtr79a6vurksp5rfr04',
  NULL,
  'Deposit to Ganamos!',
  '2025-10-21 15:59:58.262949+00',
  '2025-10-21 15:59:58.262949+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '1ea38e57-739a-4177-87ae-44e4b30d1ae1',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'deposit',
  0,
  'pending',
  '62e23a57488f9869ee5bc7d121899c7450327310e30767ceca4f139d8919114e',
  'lnbc1p500tsxpp5vt3r546g37vxnmjmclgjrzvuw3gryucsuvrk0nk2fufemzgez98qdqlg3jhqmmnd96zqar0yprkzmnpd4hhxggcqzzsxqrrsssp5hyesjalyt0fprwwdueyvycznnd3nngfvazgxpemcegdvd95fk4gq9qxpqysgq5jgjtfh03jk26efsss84s8h5jae9fh89lzw5rukt9d9sxdtxya8s0dwzgxcpzjd7vtyzvl9lsa9n36fzxej9cfhcp9qtxqq7m938m9gp5ak7p4',
  NULL,
  'Deposit to Ganamos!',
  '2025-10-21 16:00:06.446309+00',
  '2025-10-21 16:00:06.446309+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '48696575-1439-45cb-97c9-4541676c52b0',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'deposit',
  0,
  'pending',
  '82002dbd1461019cad426c96ad9249cdbe1d1a0e821e75498ac11ddfbe4dcbd1',
  'lnbc1p5032plpp5sgqzm0g5vyqeet2zdjt2myjfeklp6xswsg082jv2cywal0jde0gsdqlg3jhqmmnd96zqar0yprkzmnpd4hhxggcqzzsxqrrsssp5c0mvsvlak9xpwugzrvhq29d2ghhcqgdyawsw6juug5vee44f3jsq9qxpqysgq5qgdac7l0newm0czulqagt0jua5mngvktgmz7wee26e9s8v9hq23vqe407flxwh0yddkfk30pf58m290safnar9wwn2s0ec7wecmr7qqa9a6ru',
  NULL,
  'Deposit to Ganamos!',
  '2025-10-22 09:47:43.557074+00',
  '2025-10-22 09:47:43.557074+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '28e8c20e-5fcd-4b9a-8915-6da2eec941a7',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'deposit',
  0,
  'pending',
  '625492890268bd4188a6c035fd54d22e0ad53efa9e8a4f9681c9258b3b427695',
  'lnbc1p5032z8pp5vf2f9zgzdz75rz9xcq6l64xj9c9d20h6n69yl95peyjckw6zw62sdqlg3jhqmmnd96zqar0yprkzmnpd4hhxggcqzzsxqrrsssp527w6kyxmwz506k3h6avg35pa8ntsqkhgu9vjzdus0mwajg524w3s9qxpqysgqcullvyahup2e7pple0klnn84rt8d0thpjpkt0ltqegg00stjakv9fd5yze3cpvznwgnvq2her5hwln8m8rllc7rgrxr4ypq0hpggncqqz2lw3f',
  NULL,
  'Deposit to Ganamos!',
  '2025-10-22 09:47:51.5606+00',
  '2025-10-22 09:47:51.5606+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '3a198f86-c80d-4460-8489-f26229e6abef',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'deposit',
  0,
  'pending',
  '782656bb428ed6b7ac6472d44a2ec339758777b0a9b6591bb24003832347f9fe',
  'lnbc1p5032y5pp50qn9dw6z3mtt0trywt2y5tkr896cwaas4xm9jxajgqpcxg68l8lqdqlg3jhqmmnd96zqar0yprkzmnpd4hhxggcqzzsxqrrsssp5tt5y95dlycwmn2fthmfwy7kj46zhcrk2gzht23z4fuppx8e0jadq9qxpqysgqpznllagwaeq832w6xs5fy7gak6fxpnv8jgzgm03mslm4t8ac37qs305l5tfntu9edup0g8h5ypgy3j9tf9kh83r676qmwvdmp29m43spndexje',
  NULL,
  'Deposit to Ganamos!',
  '2025-10-22 09:49:08.769691+00',
  '2025-10-22 09:49:08.769691+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '1799951e-4e4d-4650-8896-3ee1f86467bf',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'deposit',
  0,
  'pending',
  'f33b57bb690161a310568af40830185c3da06a9263e629460f584036ddab3a7c',
  'lnbc1p5032x0pp57va40wmfq9s6xyzk3t6qsvqcts76q65jv0nzj3s0tpqrdhdt8f7qdqlg3jhqmmnd96zqar0yprkzmnpd4hhxggcqzzsxqrrsssp5rtdrgwg8pflsdm9g0x3xt2zlje0kzmfn9gnvxppdgxqw5kufn66q9qxpqysgqfzjx4jueldf50w8udacfyzwzasd6lzzkjl3efv5at5g4vl8yg0l56njs8jc3dc3chuzh4rar98ymkck55wj3garlzs0gut6hjltzmqspquys0n',
  NULL,
  'Deposit to Ganamos!',
  '2025-10-22 09:50:07.587496+00',
  '2025-10-22 09:50:07.587496+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '1968b529-a598-41a8-9ba0-031f0c2fb046',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'deposit',
  0,
  'pending',
  'd2c4baf22473525895d0d239cddf9961e628e1b3266f685f4de30fd0322649f9',
  'lnbc1p50jrllpp56tzt4u3ywdf939ws6guumhuev8nz3cdnyehksh6duv8aqv3xf8usdqlg3jhqmmnd96zqar0yprkzmnpd4hhxggcqzzsxqrrsssp5lzvec87tyx0csdx5rz5nhc9w8xdcz5anuq2th5w05x6nrvuyf2fq9qxpqysgq48qwtsjmd9seen8j27fk2kcel33u38f6fk2uyw524gvkdehfwpg32mw7dfqjvm5d0v2nyqrjgeaayxzctg0lxqtg063cxwjft2hk23gp3auc7q',
  NULL,
  'Deposit to Ganamos!',
  '2025-10-22 17:10:23.298162+00',
  '2025-10-22 17:10:23.298162+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '6f001b22-f717-4383-b9f2-1dddd70a3f2c',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'deposit',
  0,
  'pending',
  'cb58207af5493624551cf73ee5fa5a835256e6aaabeb2d78de2959b63f1b0b02',
  'lnbc1p50jyxupp5edvzq7h4fymzg4gu7ulwt7j6sdf9de42404j67x799vmv0cmpvpqdqlg3jhqmmnd96zqar0yprkzmnpd4hhxggcqzzsxqrrsssp52t2gf40neaegpwjszzj79rpzewht34tsmxln7ckf5j3alx83rfvs9qxpqysgqz3dpnsyujktzw3t6fjgvk2cwsr7qraqttf2mcccuyc78mpjkcrrhsehllruvjddm643geqkxlrky4ghs3d3cujhknmeg3l0gj0873aqpzs3kw6',
  NULL,
  'Deposit to Ganamos!',
  '2025-10-22 17:14:04.396264+00',
  '2025-10-22 17:14:04.396264+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '3438cdaf-984b-4e1d-a606-4f706802a082',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'deposit',
  0,
  'pending',
  '2190926ccdac6548485fc858455e01b45da0508b86fa1c79c7afd99e053e45d3',
  'lnbc1p50jyttpp5yxgfymxd43j5sjzlepvy2hspk3w6q5ytsmapc7w84lveupf7ghfsdqlg3jhqmmnd96zqar0yprkzmnpd4hhxggcqzzsxqrrsssp5qkr56zg53wzgjl3szdpaplgky8jsf7h0zreq8vykkqs5v8arh0ns9qxpqysgq88e9uzdsj7hv4geduthghhuqurce93zuacs90alp334axecfch48w06eelc0gy2xulejhe974eqanx2x0ycf6eywwa3ep50vp3x42tspl755gk',
  NULL,
  'Deposit to Ganamos!',
  '2025-10-22 17:16:28.07851+00',
  '2025-10-22 17:16:28.07851+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  'afb0a987-3bec-44a2-93bc-01cc9f00781d',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'deposit',
  0,
  'pending',
  'c90f0c80e41aa5103eb84445ffb24694083d9459319d1694a1a1d9bf79bf2e02',
  'lnbc1p50jywapp5ey8seq8yr2j3q04cg3zllvjxjsyrm9zexxw3d99p58vm77dl9cpqdqlg3jhqmmnd96zqar0yprkzmnpd4hhxggcqzzsxqrrsssp59ar9q4aaepqyg4rp75hdcy5kgegspuuu42esz72z05yghkpvcvgs9qxpqysgqjwxk49u9u390792gg55ssc9dmxhrmr8lw57h2kw4faj9yf26gw98969f89rwdvr8d6y2t87ayqrx8ylfh5sr85vc63uvy9a6hg9l3qcpp43x7c',
  NULL,
  'Deposit to Ganamos!',
  '2025-10-22 17:18:21.281981+00',
  '2025-10-22 17:18:21.281981+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  'd6035a7d-b1dd-4ca5-879f-f50860f4d02e',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'deposit',
  0,
  'pending',
  '694df24b40009d627bf2b8fc5da79c42937e9c8f61132d165f49330152613179',
  'lnbc1p50jyjjpp5d9xlyj6qqzwky7ljhr79mfuug2fha8y0vyfj69jlfyesz5npx9usdqlg3jhqmmnd96zqar0yprkzmnpd4hhxggcqzzsxqrrsssp5mufe9y0q0xsda5vml6cvepxrcg637vkqm5uf8npfxrg6jau7gqeq9qxpqysgqwycmjud3yhdhk2d5ef6z2nmwdlaewaycgt9qecaaktaglpqk7g2q56hct80z8ale2mddes89hpayxmfl9pwn6jmwtghmff45ppvt6yqqhcxs4k',
  NULL,
  'Deposit to Ganamos!',
  '2025-10-22 17:20:18.676655+00',
  '2025-10-22 17:20:18.676655+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '17cf95fc-c050-4af8-9b30-4e736850e2b7',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'deposit',
  25000,
  'pending',
  'e94dfc7b26d791feb4afdaf7ed92ded7e35ebe506770d47402f51ec2e5cf63d1',
  'lnbc250u1p50jyj7pp5a9xlc7ex67glad90mtm7myk76l34a0jsvacdgaqz750v9ew0v0gsdpsg3jhqmmnd96zqv34xqcrqgrnv968xgr5dusywctwv9kk7uepcqzzsxqrrsssp56yqpksuez3mxlhze9lulg3xaljs5h2qxfnqnfpmwqs7cuegnjw6q9qxpqysgqxrmazny7lsx2a9xch4l4dv5dl3ua3wa6kcg78ked8n467zcph57pkqu0kxqdxhgy2hddqr6gh9w6n72zth5k6gkejs2c7j2pat7nq8cpndgyz8',
  NULL,
  'Deposit 25000 sats to Ganamos!',
  '2025-10-22 17:20:31.188801+00',
  '2025-10-22 17:20:31.188801+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  'b0d7fb02-af12-4d44-8a6c-96f3a4a79eae',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'deposit',
  0,
  'pending',
  '219cb1be082901bf8e42af59e6c2100b0eb349b006494a852cca49f22e493496',
  'lnbc1p50jy5vpp5yxwtr0sg9yqmlrjz4av7dssspv8txjdsqey54pfvefylytjfxjtqdqlg3jhqmmnd96zqar0yprkzmnpd4hhxggcqzzsxqrrsssp58vxvyuwdell2xdkhjk7dj8v5vczqq5q70xz8947zg2lkk76c2jrs9qxpqysgqy4ugfwlr3rggev8ej3wmcqq4pkx29zpx48s65kk9r40wvz3uymen0jqppktytxudplsm2ghphz0yv57w8m9pl3umg2k40ng5e70vhgcqy3nuk6',
  NULL,
  'Deposit to Ganamos!',
  '2025-10-22 17:21:16.632094+00',
  '2025-10-22 17:21:16.632094+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '62307bde-63ab-4644-9b4a-04315f129861',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'deposit',
  0,
  'completed',
  '20be249cd2e88034b1bb0d912c6e989d69d8f24a6a0239972a5446de6c5abdae',
  'lnbc1p50jymfpp5yzlzf8xjazqrfvdmpkgjcm5cn45a3uj2dgprn9e223rdumz6hkhqdqlg3jhqmmnd96zqar0yprkzmnpd4hhxggcqzzsxqrrsssp55ag5fxdhvthd3l5uhpyd26pjpwdp0j2j7ded202hgx5cdqhdjmgs9qxpqysgqnec63yy4v78nal2ry3cv6x0km2fv4jx3zzskd0xfth2pyrpvw3grpzhdyrkrsjxpqv2uvay84duje2d6uy68c9rp75dhdcfmyzmnu2cplxunnq',
  NULL,
  'Deposit to Ganamos!',
  '2025-10-22 17:24:57.995041+00',
  '2025-10-22 17:25:17.792+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '01ebf882-3da1-4b22-ad92-8f676e44d44c',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'deposit',
  0,
  'completed',
  'e44beb0817dad3a3115d16e873236ddfe637b77216bad6e6d71927c99bed6c0a',
  'lnbc1p50jyunpp5u397kzqhmtf6xy2azm58xgmdmlnr0dmjz6addekhrynunxldds9qdqlg3jhqmmnd96zqar0yprkzmnpd4hhxggcqzzsxqrrsssp59de7qtpse0nqzcser2vr3hgj645y8l9fljv5mhckrkx75mgcjdqq9qxpqysgq6wdys5987nwmw7xye2zvrh2xnql7tp5rv2d3a6xwskg2l9hqy689pdpnctcgj5jpe6xhu0x0wcyr8qac4fygc4rsr7vkxdm6wcmp8pqq9j2v9d',
  NULL,
  'Deposit to Ganamos!',
  '2025-10-22 17:25:39.606177+00',
  '2025-10-22 17:25:47.398+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '0101ef99-d24a-48dc-9788-6d1b0cdb94fe',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'deposit',
  0,
  'pending',
  '32cf8163e2407db9055a674707343ad51ba09730b5ecf7d9473ae559f35fe992',
  'lnbc1p50j9qgpp5xt8czclzgp7mjp26varswdp665d6p9eskhk00k288tj4nu6laxfqdqlg3jhqmmnd96zqar0yprkzmnpd4hhxggcqzzsxqrrsssp5vzpym2tnm5klht28u7au635zrqfhz5zmru5ryg422l3c4zp9vzsq9qxpqysgqrph83rxeprayqerwhzgprdyys7wry046p2g4lwce4qf5puprrvu8u4v44m9fqkmvsf59pkknf90sy478m5wasdqrxk4tqvaq5wsqmwqpl26tuv',
  NULL,
  'Deposit to Ganamos!',
  '2025-10-22 17:27:36.647248+00',
  '2025-10-22 17:27:36.647248+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '972f5ad1-fd49-40d8-837d-ebb49435131d',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'deposit',
  0,
  'pending',
  '7cd5117195040cbc916520b3a864961413a7975dd1bab5c8e4a06dffd669bd8e',
  'lnbc1p50j9qvpp50n23zuv4qsxteyt9yze6seykzsf6096a6xattj8y5pkll4nfhk8qdqlg3jhqmmnd96zqar0yprkzmnpd4hhxggcqzzsxqrrsssp5a47n95565hzweednw0l8j54x9ygvkcwernl5lahqx67p72k7846q9qxpqysgq7cyzzxyuv22t38d0l2xzycj5mhy674tsydlqmx0l9hge9kdx0t7p4cudg4dtnyahts0j38ct8nkv3ra87gpclam8jwsykrqhvtt7uzgpg93p47',
  NULL,
  'Deposit to Ganamos!',
  '2025-10-22 17:27:41.215667+00',
  '2025-10-22 17:27:41.215667+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  'c752d640-f463-4592-b134-e428210af034',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'deposit',
  0,
  'pending',
  '8ff97477da17d0b6374ef8f240e80652bc54b9744824b7ad1eb496193e91483d',
  'lnbc1p50j9qhpp53luhga76zlgtvd6wlreyp6qx2279fwt5fqjt0tg7kjtpj053fq7sdqlg3jhqmmnd96zqar0yprkzmnpd4hhxggcqzzsxqrrsssp5gms3aall2hv55zewd0as33ath3h73nuzh76eagjwfrggaea8cw7q9qxpqysgqwll5scwlwykau02t782axddsxr6yg8ux6jfa2r0zacau9fttf0zzpgxj4hp3kss4nkj3ruu035ejg6gnx7zdaw4xz7hua9zhff0mudsp9xu792',
  NULL,
  'Deposit to Ganamos!',
  '2025-10-22 17:27:52.139427+00',
  '2025-10-22 17:27:52.139427+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  'dd4b3dee-f6a1-4172-902d-828bc073d96b',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'deposit',
  1000,
  'pending',
  '6f676a4c169aa24de3d66e6c50d7f0f07234499b248fe7f5329ad47e26d409f8',
  'lnbc10u1p50j9papp5dank5nqkn23ymc7kdek9p4ls7pergjvmyj870afjnt28ufk5p8uqdp0g3jhqmmnd96zqvfsxqczqumpw3ejqar0yprkzmnpd4hhxggcqzzsxqrrsssp5237alsnxmfltjdj7zxcf20d2x8l47rensxdxf9lu23axcxqdkwqs9qxpqysgqe29hkjr8ywektlgx24n56ckantypqwfmzkfprawxvsyymalk0fcqgmf62jk5ad9wedv0syjw7kwse0d7xlgkuwwajsquqpe02uzw6lqp9dnxhv',
  NULL,
  'Deposit 1000 sats to Ganamos!',
  '2025-10-22 17:28:30.166147+00',
  '2025-10-22 17:28:30.166147+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '9ee152ac-c001-4db0-9564-d5c9b46ca1c6',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'deposit',
  0,
  'pending',
  '016da71a27b471f8e36c87e07dc9a43205d089b72144a4c5aca0c38c9aa0ebb2',
  'lnbc1p50j9z2pp5q9k6wx38k3cl3cmvsls8mjdyxgzapzdhy9z2f3dv5rpcex4qaweqdqlg3jhqmmnd96zqar0yprkzmnpd4hhxggcqzzsxqrrsssp5eqfdne23rmzpjusrunqdh8jr2jhn7se0fc7d0v4rfss3llz8zh9s9qxpqysgqt3f6ttfsfcpclskqywycngxrtykx22ef4cjdjc29npfz8rpxurf80ekgkp46fsxdmmy5zsldt99nzyfvsalqwem3ereahc07yea2twspvhacjv',
  NULL,
  'Deposit to Ganamos!',
  '2025-10-22 17:28:42.280081+00',
  '2025-10-22 17:28:42.280081+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  'f1b8d0f3-a1aa-4189-a9e7-ebc432d80bd5',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'deposit',
  0,
  'pending',
  '60842e55f9efcc316f2587f5e213996595c0c10e1b89f13401ea3e047bbee917',
  'lnbc1p50j9zlpp5vzzzu40ealxrzme9sl67yyuevk2upsgwrwylzdqpaglqg7a7aytsdqlg3jhqmmnd96zqar0yprkzmnpd4hhxggcqzzsxqrrsssp5jhlgs629nqpu9wgfuhu5r88le7dwhdfy4jg8pafedw7zppk7vxus9qxpqysgqdwuxjzrrwz043ed42wvmhpqjtktn04pp3kdr9w4xj3x5vk0c3dr8a4dw5f8ysrxfeprf33l8c7ckzwrf0ekaqmqd0jjsq5ag9lpyz4gqy8x8vy',
  NULL,
  'Deposit to Ganamos!',
  '2025-10-22 17:29:03.643691+00',
  '2025-10-22 17:29:03.643691+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '908a8de0-e37c-49e1-a34b-7cd4cfc4f09b',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'deposit',
  2000,
  'pending',
  'e4b7a0059fad1563848536fcc05158f9ed12cd13d155410aec2fef919685eb6a',
  'lnbc20u1p50j9rtpp5ujm6qpvl452k8py9xm7vq52cl8k39ngn6925zzhv9lher959ad4qdp0g3jhqmmnd96zqv3sxqczqumpw3ejqar0yprkzmnpd4hhxggcqzzsxqrrsssp5gls6yj5uzega8ql4wan3q6q070mzfgjx36ecy6wdk6mjj4y5u39q9qxpqysgqvz995udpmx92gmae9q9mlzamtqh460munrsvxganwz300dzmfcex06vvxce3022jc55nt8uz68lpk4cgpdvrzwnnxmkyknl5k9z9umgqlh6rft',
  NULL,
  'Deposit 2000 sats to Ganamos!',
  '2025-10-22 17:29:15.562342+00',
  '2025-10-22 17:29:15.562342+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '66a75b4b-fdf7-4ca4-8dcd-1fc5954666bd',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'deposit',
  2000,
  'pending',
  '72543e40509e20277f1b7d8d07d2b367e0ba56c944af3b13149876498921dfff',
  'lnbc20u1p50j9yppp5wf2ruszsncszwlcm0kxs054nvlst54kfgjhnkyc5npmynzfpmllsdp0g3jhqmmnd96zqv3sxqczqumpw3ejqar0yprkzmnpd4hhxggcqzzsxqrrsssp5vn5jpk620qhv93r9wjy3vqr5dveg4zu2ve8sp2kheulfrjsg0qus9qxpqysgqdfdjtar6hqfd9rh9jkk9w62u2cfkugt4s2upcwzwwxrz65hj9duz3zk5y0ynm3xxh0pwq9737feduuf97t93jfnz6n38vyx47pd03hgp4fey4j',
  NULL,
  'Deposit 2000 sats to Ganamos!',
  '2025-10-22 17:29:38.188186+00',
  '2025-10-22 17:29:38.188186+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '7e9522cf-2c42-45a5-9dd5-b2fc96e5cade',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'deposit',
  3000,
  'pending',
  '3de9b2a798415f02410055f08ab56302b524fbdf1c8929e15b729cd2696f068a',
  'lnbc30u1p50j9ykpp58h5m9fucg90sysgq2hcg4dtrq26jf77lrjyjnc2mw2wdy6t0q69qdp0g3jhqmmnd96zqvesxqczqumpw3ejqar0yprkzmnpd4hhxggcqzzsxqrrsssp53vygcccq69x3ax47a62v0y2mzvgc2z42rlm2x9rk42fksv7pq2pq9qxpqysgqlx0lfprqatalknxurs3c7nf2whjutl0g7qweph8kr3emm5tlszm8ypvquh37wms4hs5dvdh5trhv3deps5ygmtea9ph65j8tq9ft4gsqetvny3',
  NULL,
  'Deposit 3000 sats to Ganamos!',
  '2025-10-22 17:29:58.853422+00',
  '2025-10-22 17:29:58.853422+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  'b472852d-c943-4d39-8452-a5bc33c694c9',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'deposit',
  0,
  'pending',
  'df85219b3da83a45734cac1ac770c2d88e0fd267f7ad3dcb7bcd1a2d50d3e1b1',
  'lnbc1p50j9fwpp5m7zjrxea4qay2u6v4sdvwuxzmz8ql5n877knmjmme5dz65xnuxcsdqlg3jhqmmnd96zqar0yprkzmnpd4hhxggcqzzsxqrrsssp5m4e8jvy24f2cmmy8vpvqfzplpyggg02nzcjhwgkyrv0a87vg5zxs9qxpqysgqxphs4wesucmdwhfuqhvj7ylwhdzkstn4a9mspr96x6wcmj9yd4trx3gdydetws6ancdfkl866cz3mg30n56uye034dv0mccu7kxgymspvafpqt',
  NULL,
  'Deposit to Ganamos!',
  '2025-10-22 17:32:30.298844+00',
  '2025-10-22 17:32:30.298844+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  'af49ca32-97a6-49ca-bacc-c3fae97ba839',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'deposit',
  0,
  'pending',
  '49e5a969c68eace7c3912151f06a7f02184078248bacbb921f447f88b9822b34',
  'lnbc1p50j9f5pp5f8j6j6wx36kw0su3y9glq6nlqgvyq7py3wkthyslg3lc3wvz9v6qdqlg3jhqmmnd96zqar0yprkzmnpd4hhxggcqzzsxqrrsssp539vzdw4rlmztrf645504rjdhxwm2qc0z5zyy5c4tkyl7ajdsdxss9qxpqysgqe9wdwxm4ekjrgj8js3geytg6uswugvhhxknhzaqp46clnra6qn5zem9hfufyrhet4639hvr3t4tgz7vrmnkzx0d03dq48zpcmuq92pgqyjrutq',
  NULL,
  'Deposit to Ganamos!',
  '2025-10-22 17:32:36.955681+00',
  '2025-10-22 17:32:36.955681+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '9cfc25f6-60e8-4bae-a579-26a13cc2ab76',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'deposit',
  3000,
  'completed',
  '346eaec27ee90d56373556807773201c7bf811c0b2d7e72ef3f86765a2886834',
  'lnbc30u1p50j92ppp5x3h2asn7ayx4vde426q8wueqr3alsywqktt7wthnlpnktg5gdq6qdp0g3jhqmmnd96zqvesxqczqumpw3ejqar0yprkzmnpd4hhxggcqzzsxqrrsssp55kftwvt3jlstfvaarmk2avjer5m4c5auat4njfst3e56yq4jhfgs9qxpqysgq5rw7yur2fcygdzr09grkvszm2hpsl409qa3cupckyxn920qajltx5fpxnyq4krmpa6z8hq4jenr7pkxxs69eyltsjcdqnk6arm90r4qp227p0d',
  NULL,
  'Deposit 3000 sats to Ganamos!',
  '2025-10-22 17:32:49.821456+00',
  '2025-10-22 17:32:57.499+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  'c40baccb-57b2-40a0-996f-6e518fb6857b',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'deposit',
  0,
  'pending',
  'ae5af197dae6af3c1a153f1c35f30b037939c7680cb90560ef363df7849196a7',
  'lnbc1p50j9nrpp54ed0r976u6hncxs48uwrtuctqdunn3mgpjus2c80xc7l0py3j6nsdqlg3jhqmmnd96zqar0yprkzmnpd4hhxggcqzzsxqrrsssp5vxm43z6hq5hrqy727y7qw79cxfha528nh0l3qxz5zd4q36xgeuhq9qxpqysgq85r4a22wh0h3rfc78z4azqyaf3y8pj0ngsywq6vlchlx3pgt906na2868c28yads62ltew9dknk0vzd6jfs34m5gm5vhcu3z5cyqf4cq0ektzu',
  NULL,
  'Deposit to Ganamos!',
  '2025-10-22 17:37:40.11771+00',
  '2025-10-22 17:37:40.11771+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '04c44952-8649-4014-bb0a-1053b83003fb',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'deposit',
  3000,
  'pending',
  '90c6860dcf8037493ee9951a2b4d5d1f7b4be2de48366acc6808c49fbe0f311d',
  'lnbc30u1p50j9n5pp5jrrgvrw0sqm5j0hfj5dzkn2araa5hck7fqmx4nrgprzfl0s0xywsdp0g3jhqmmnd96zqvesxqczqumpw3ejqar0yprkzmnpd4hhxggcqzzsxqrrsssp56g268decyeg3wx2qgtg8yae2w7n5tsduypx2sxj92pvhwftc4a5q9qxpqysgqna0sczmn7t7s3wvnty5s5jn0y8kjmet0wycjal0634hjrpc029sn73c540qylpklxy67fd6fkl27wpkqmgnphyx76u9ulx8j8hu7jacquxdu9a',
  NULL,
  'Deposit 3000 sats to Ganamos!',
  '2025-10-22 17:37:56.751914+00',
  '2025-10-22 17:37:56.751914+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '6db39c27-2d6f-4de0-be54-39af467220ae',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'deposit',
  5000,
  'completed',
  '8df230347bbda836e3b3264e55d06993e1062a907376e121488bd344f9c92f29',
  'lnbc50u1p50j9nlpp53herqdrmhk5rdcanye89t5rfj0ssv25swdmwzg2g30f5f7wf9u5sdp0g3jhqmmnd96zqdfsxqczqumpw3ejqar0yprkzmnpd4hhxggcqzzsxqrrsssp5r3yjr7mmk59t58cd4qs4q9mh5k5ezvzsev7y6teqnf5ddggrs3eq9qxpqysgq8c0r5mdlf93arxa628cvpxq7j438ljl9f023jswjp6lkf3hgdfpk8swr59pj4km6ara0hk55mqjchnd3lgj9ya5pkakg3um39qx04qcpk4v303',
  NULL,
  'Deposit 5000 sats to Ganamos!',
  '2025-10-22 17:38:07.971142+00',
  '2025-10-22 17:38:13.754+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '694ec2ef-1667-4f6c-a425-52c858f5ce7a',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'deposit',
  0,
  'pending',
  '27ae41a8a159ed11f30640e97b8fba56efae932926e75e9701041d6be9174a65',
  'lnbc1p50jxq6pp5y7hyr29pt8k3rucxgr5hhra62mh6ayefymn4a9cpqswkh6ghffjsdqlg3jhqmmnd96zqar0yprkzmnpd4hhxggcqzzsxqrrsssp5ktleytg6e7x2j4jgjrhrhqtctvrkknqcyakphcqct0scz8e4yd0s9qxpqysgqkx20g43hzegcuyzaec050sf620edgrugfkjphw4hlqlws8ghu9d9n3r8mmqxdt8kaaqjrvufts8cnwun5gg998lluhakvc6z4umvdnsptmdqxu',
  NULL,
  'Deposit to Ganamos!',
  '2025-10-22 17:44:58.522183+00',
  '2025-10-22 17:44:58.522183+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  'df6de527-25b0-418c-9757-46cd7fb5e8ab',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'deposit',
  0,
  'pending',
  '210196f98bd3a5d3feee52b1bf3894da8895d02f93b086f201a09a1744c27da1',
  'lnbc1p50jxpzpp5yyqed7vt6wja8lhw22cm7wy5m2yft5p0jwcgdusp5zdpw3xz0kssdqlg3jhqmmnd96zqar0yprkzmnpd4hhxggcqzzsxqrrsssp5ey6ytx8j9pv6yup9mjtkczmquqmj9r0nhdr0w94ehr5lpe78rckq9qxpqysgqqlxssl44yramqjm8c52xjlmjcu9euad0z22axw6p2aygwttpnyqkkrn35zff63l5t8lnqfmfp76ztegf5e4nw702yjuycpwtwgznxegpz5l2ke',
  NULL,
  'Deposit to Ganamos!',
  '2025-10-22 17:45:06.4473+00',
  '2025-10-22 17:45:06.4473+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  'd95f684c-532f-49e3-8db6-2cd58f4cd0ea',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'deposit',
  0,
  'pending',
  '40ae4bd1c8b6200aeb4bab813b8c080cc33db888e109abedbc03c8946ea3ae2d',
  'lnbc1p50jxp2pp5gzhyh5wgkcsq466t4wqnhrqgpnpnmwyguyy6hmduq0yfgm4r4cksdqlg3jhqmmnd96zqar0yprkzmnpd4hhxggcqzzsxqrrsssp5l0838uw0gpl49ke77v5hauzc83gr6h47pn4vavete066dk7ysscq9qxpqysgq4qkhec98c7jnkf4l4u52gc5hwuq5707hz407kd75quahqxysnjn5svrmrffhf7ayddkeustd0vtwg6utsx744yw9vclwu8xvmk26aygqvp8fp9',
  NULL,
  'Deposit to Ganamos!',
  '2025-10-22 17:45:14.745963+00',
  '2025-10-22 17:45:14.745963+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '366ff125-fbfe-4a33-b024-4d63179d0c66',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'deposit',
  6000,
  'pending',
  '963d30f6ebad8a4fb1c53a4a15ef1ee1f6b9e8b1edfb9bdab33a722a7acc6158',
  'lnbc60u1p50jxpapp5jc7npaht4k9ylvw98f9ptmc7u8mtn693ahaehk4n8fez57kvv9vqdp0g3jhqmmnd96zqd3sxqczqumpw3ejqar0yprkzmnpd4hhxggcqzzsxqrrsssp5vg48cjsxzqekttnlauswrts4y79yhzj7h3rt59kjq0s553mhqrqq9qxpqysgq887cfmhhuyrvcmjmxjxxxfn998pr7klfjq8ehs704s7pddvzsug47uy5x0xk56tve7egv6tsqe6rm5rtz5hh9746pxe4gr4jjdvkegqqph6skc',
  NULL,
  'Deposit 6000 sats to Ganamos!',
  '2025-10-22 17:45:33.904297+00',
  '2025-10-22 17:45:33.904297+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '8d293dc2-7051-407f-9068-6c4811164dcd',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'deposit',
  5000,
  'completed',
  '850238ad5b8812401852d68b0eaa057d7b0ac59f619dbfbeb081462fdf63cf44',
  'lnbc50u1p50jxzwpp5s5pr3t2m3qfyqxzj669sa2s904as43vlvxwml04ss9rzlhmreazqdp0g3jhqmmnd96zqdfsxqczqumpw3ejqar0yprkzmnpd4hhxggcqzzsxqrrsssp589zc89arnzfwyfm25x2tpssvrdt4pk00lhyqnjauafy6p4w3ezks9qxpqysgq5cvcrcaxhychyy05372qzqp6m0cg9l6svru9tsclflh9mx0hwng80543lsjpdupz3hza89zqgprfj8m9lxvwtpuc383j68uzcuk9d0cquku00m',
  NULL,
  'Deposit 5000 sats to Ganamos!',
  '2025-10-22 17:45:51.150145+00',
  '2025-10-22 17:45:58.85+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '126b3d84-305c-4776-9ff0-c9385a4cf6fd',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'internal',
  -1000,
  'completed',
  NULL,
  NULL,
  NULL,
  'Transfer to @annie-murray',
  '2025-10-22 18:15:21.084403+00',
  '2025-10-22 18:15:21.084403+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '87a48c22-f744-4464-9ad2-24f5e748eda1',
  'ce210e13-15c9-467b-b86e-6768dbdc3bca',
  'internal',
  1000,
  'completed',
  NULL,
  NULL,
  NULL,
  'Transfer from @Brian',
  '2025-10-22 18:15:21.084403+00',
  '2025-10-22 18:15:21.084403+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '2bab6d70-bcef-4a39-be63-aa90878819a8',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'deposit',
  0,
  'pending',
  '99f4e98fdc1ef33984a49d6ee129309ff5b444716cd1e9a8121aea57f202db1b',
  'lnbc1p50jgkfpp5n86wnr7urmennp9yn4hwz2fsnl6mg3r3dng7n2qjrt490uszmvdsdqlg3jhqmmnd96zqar0yprkzmnpd4hhxggcqzzsxqrrsssp57c6q0s75mdz2arkxjak7ryrxqp723h3grf4ysnsuhfm4ktxslsmq9qxpqysgqlkxzhnzujg97r93nvmsm9lndfkh9llcgx24hqgcv0z93h3637ft8ffma3qy8qwv4gwcr6ueh5xtc3ctrtv4f7t0pttr0u3nmnqq57tqp5sxjxl',
  NULL,
  'Deposit to Ganamos!',
  '2025-10-22 18:30:33.672482+00',
  '2025-10-22 18:30:33.672482+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  'f3df5fb2-eb8c-4ecb-a41b-57210d3ba8bd',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'deposit',
  100,
  'completed',
  'eb8e1258f04d7d4ba50a03d205710280bcf30cc8a79b0c0e6ddf655d268000c0',
  'lnbc1u1p50jgavpp5aw8pyk8sf475hfg2q0fq2ugzsz70xrxg57dscrndmaj46f5qqrqqdpdg3jhqmmnd96zqvfsxqs8xct5wvs8gmeqgaskuctddaejzcqzzsxqrrsssp5ncf0vyqt28cdtld4pmn727u2xhsgejpjkq9ntufen7hr9lzwsmnq9qxpqysgqvqjs7nghrxgcs6ks0exn8lzeks2f0we2e4xukspnddf85l0tsuwrv5svy9m7ek54sy8qsw428a9d3cl7s592ldmr6rcena4scutaqcqqg0mhjv',
  NULL,
  'Deposit 100 sats to Ganamos!',
  '2025-10-22 18:34:20.464362+00',
  '2025-10-22 18:34:30.357+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '882095f6-c1c9-4fb7-b5f3-a36fa606e1cb',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'deposit',
  1000,
  'completed',
  'e467f730327039a6e677b7380657a97ac7cf104edc337295d88ba5a8e985369c',
  'lnbc10u1p50jfqspp5u3nlwvpjwqu6denhkuuqv4af0tru7yzwmseh99wc3wj636v9x6wqdp0g3jhqmmnd96zqvfsxqczqumpw3ejqar0yprkzmnpd4hhxggcqzzsxqrrsssp5w88fneg5nlgnywqhpc9cllsv3plqn8jd9ksykpeeg3zzxyn3u7xs9qxpqysgqrtlag353qsln3r55jw2qxkh9xcf3kyx5j3aecgfd4ypq9errhkw8ajtl3lk9grnzs0qzpmj3tu934pk2yh2prl5e32vjk4cvmdxvvtsqnj6h2q',
  NULL,
  'Deposit 1000 sats to Ganamos!',
  '2025-10-22 18:36:01.202148+00',
  '2025-10-22 18:36:12.972+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '6980da39-1521-43c0-a959-487e775aa05f',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'deposit',
  0,
  'completed',
  '5c853231fbecc3ecae8c7a2067c720a3036a0a919893e1b8b3b04ea6e15e4d6b',
  'lnbc1p50jfrupp5tjznyv0manp7et5v0gsx03eq5vpk5z53nzf7rw9nkp82dc27f44sdqlg3jhqmmnd96zqar0yprkzmnpd4hhxggcqzzsxqrrsssp5q77yj6gfhzntgs7qgqlaufl6s7xe64s9nhxnunuf88afk7a9gvus9qxpqysgq3t663pp3qflv490hm08cm2x0cw2rkuqcs7y4pw554j0amurkwqgyxsya388uv9p7facp9n9s8cfcf8wu03gun90hjnkj7alfcd3my8gq45c699',
  NULL,
  'Deposit to Ganamos!',
  '2025-10-22 18:37:48.933911+00',
  '2025-10-22 18:38:08.759+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '7152b6b8-8919-4786-8ab0-4a42ade4eb14',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'internal',
  -8000,
  'completed',
  NULL,
  NULL,
  NULL,
  'Transfer to @annie-murray',
  '2025-10-22 20:58:42.880002+00',
  '2025-10-22 20:58:42.880002+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '7e321f4e-90f4-4860-a661-70b70084782e',
  'ce210e13-15c9-467b-b86e-6768dbdc3bca',
  'internal',
  8000,
  'completed',
  NULL,
  NULL,
  NULL,
  'Transfer from @Brian',
  '2025-10-22 20:58:42.880002+00',
  '2025-10-22 20:58:42.880002+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  'e3da5118-b1f7-41d8-b48d-dad35d0fcc14',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'internal',
  -5000,
  'completed',
  NULL,
  NULL,
  NULL,
  'Transfer to @brynn',
  '2025-10-22 21:07:23.426211+00',
  '2025-10-22 21:07:23.426211+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '0b48e3e7-79d1-4747-af46-3764135b8e79',
  'a6c07129-6f99-4bdd-ba12-b1756f681af6',
  'internal',
  5000,
  'completed',
  NULL,
  NULL,
  NULL,
  'Transfer from @Brian',
  '2025-10-22 21:07:23.426211+00',
  '2025-10-22 21:07:23.426211+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  'd0988e06-1de6-4e94-b5a9-555ec361515a',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'internal',
  -5000,
  'completed',
  NULL,
  NULL,
  NULL,
  'Transfer to @charlotte',
  '2025-10-22 21:34:21.504566+00',
  '2025-10-22 21:34:21.504566+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  'da29acc4-06a2-4742-bcea-b2a6e4a25849',
  'ab7dbcc3-057b-4465-b8b7-b3ffa13442ab',
  'internal',
  5000,
  'completed',
  NULL,
  NULL,
  NULL,
  'Transfer from @Brian',
  '2025-10-22 21:34:21.504566+00',
  '2025-10-22 21:34:21.504566+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '389cc972-35ea-4b38-b7a6-b16c9ddf54c6',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'internal',
  -15000,
  'completed',
  NULL,
  NULL,
  NULL,
  'Transfer to @marlowe',
  '2025-10-22 21:34:40.664275+00',
  '2025-10-22 21:34:40.664275+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '45493daf-a189-4041-9eb5-b4a4a9a85af4',
  'd60a269f-b1a9-4030-96d5-7ddc3ca5e369',
  'internal',
  15000,
  'completed',
  NULL,
  NULL,
  NULL,
  'Transfer from @Brian',
  '2025-10-22 21:34:40.664275+00',
  '2025-10-22 21:34:40.664275+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '6e939367-8270-4f90-85cb-6f45ba21680d',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'internal',
  -3000,
  'completed',
  NULL,
  NULL,
  NULL,
  'Transfer to @kit',
  '2025-10-22 21:50:14.891689+00',
  '2025-10-22 21:50:14.891689+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  'e59cefa9-7935-4e4d-8bc7-dc6f98d8b109',
  'a48208e9-183d-4ffc-af54-4d9a0ceb0a44',
  'internal',
  3000,
  'completed',
  NULL,
  NULL,
  NULL,
  'Transfer from @Brian',
  '2025-10-22 21:50:14.891689+00',
  '2025-10-22 21:50:14.891689+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '63e67888-0c2f-4ccc-9cb0-cd09655301bd',
  'a81458c9-58ff-482e-9c65-c5ee595fae11',
  'deposit',
  0,
  'pending',
  '883edb454421ec19c55ba8b4c2f4c776e699e7a31957bed3a786392586af164d',
  'lnbc1p50566qpp53qldk32yy8kpn32m4z6v9ax8wmnfnearr9tma5a8scujtp40zexsdqlg3jhqmmnd96zqar0yprkzmnpd4hhxggcqzzsxqrrsssp597t8muyh4k2d9xxxp5vauwkpcpfqch2qvrpz4stl8jv4ushmv0cs9qxpqysgq72x83je35xph58ynr0psgtvhd7l4mpp9naes2h4q80sek4xpv0r5p2hc0v6ttqzxpl82ju83svmjgdtf6dd35v4xawjde8sm05warvgqjaaunw',
  NULL,
  'Deposit to Ganamos!',
  '2025-10-23 17:52:00.739434+00',
  '2025-10-23 17:52:00.739434+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '73bb0901-711e-42cf-9074-48922618726a',
  'dce58449-faa0-413e-8b7a-6e607d280beb',
  'internal',
  -10000,
  'completed',
  NULL,
  NULL,
  NULL,
  'Transfer to @paul',
  '2025-10-23 17:53:35.333511+00',
  '2025-10-23 17:53:35.333511+00'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '33948f5c-04aa-4912-95a5-7f2f26f8ac4e',
  'a81458c9-58ff-482e-9c65-c5ee595fae11',
  'internal',
  10000,
  'completed',
  NULL,
  NULL,
  NULL,
  'Transfer from @Brian',
  '2025-10-23 17:53:35.333511+00',
  '2025-10-23 17:53:35.333511+00'
) ON CONFLICT (id) DO NOTHING;

-- Step 3: Verify restore
SELECT 
  'Restore complete' as status,
  (SELECT COUNT(*) FROM transactions) as total_transactions,
  (SELECT COUNT(*) FROM transactions WHERE created_at < '2025-10-29') as restored_transactions,
  (SELECT COUNT(*) FROM transactions WHERE created_at >= '2025-10-29') as current_transactions;
