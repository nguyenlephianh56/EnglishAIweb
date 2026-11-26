import "dotenv/config";
import { readFile, writeFile } from "node:fs/promises";
import { Prisma, PrismaClient, type Level } from "@prisma/client";
import { createExerciseSchema, type CreateExerciseInput } from "../src/modules/exercises/exercises.schema";
import { validateExercise } from "../src/modules/exercises/validate-exercise";
import { countBlanks } from "../src/modules/exercises/exercise-content.schema";
import { formatValidationErrors } from "../src/modules/exercises/exercise-errors";

//cd server
//npx.cmd tsx scripts/import-practice-library.ts --export
//npx.cmd tsx scripts/import-practice-library.ts --import "email-admin-cua-ban@example.com"

const jsonFile = "practice-library-a1-b2.json";
const exercises: CreateExerciseInput[] = [];

function add(level: Level, skill: CreateExerciseInput["skill"], type: CreateExerciseInput["type"],
  topic: string, content: unknown, answer: unknown = null, explanation: string | null = null) {
  exercises.push({ level, skill, type, topic, content, answer, explanation, publish: true });
}

function mask(marked: string) {
  const answer: string[] = [];
  const text = marked.replace(/\[([^\[\]]+)\]/g, (_, word: string) => {
    answer.push(word);
    return "___";
  });
  return { text, answer };
}

function listen(level: Level, rows: [string, string][]) {
  for (const [topic, marked] of rows) {
    const { text, answer } = mask(marked);
    add(level, "LISTENING", "listening_fill", topic, { script: text, blanks: answer.length }, answer);
  }
}

function speak(level: Level, rows: [string, string][]) {
  for (const [topic, prompt] of rows) add(level, "SPEAKING", "speaking", topic, { prompt });
}

function write(level: Level, rows: [string, number, string][]) {
  for (const [topic, minWords, prompt] of rows) add(level, "WRITING", "writing", topic, { prompt, minWords });
}

type Question = [q: string, first: string, second: string, third: string, correctIndex: 0 | 1 | 2];

function read(level: Level, topic: string, passage: string, quiz: Question[]) {
  const questions = quiz.map(([q, a, b, c]) => ({ q, options: [a, b, c] }));
  add(level, "READING", "multiple_choice", topic, { passage, questions }, quiz.map((q) => q[4]));
}

function cloze(level: Level, topic: string, marked: string, wordBank: string) {
  const { text, answer } = mask(marked);
  add(level, "READING", "fill_blank", topic, { text, hint: "Word bank: " + wordBank }, answer);
}

function match(level: Level, topic: string, pairs: [string, string][]) {
  const left = pairs.map(([text]) => text);
  const meanings = pairs.map(([, meaning]) => meaning);
  const order = [2, 0, 3, 1];
  const right = order.map((index) => meanings[index]);
  const answer = left.map((_, index) => [index, order.indexOf(index)]);
  add(level, "READING", "matching", topic, { left, right }, answer);
}

listen("A1", [
  ["The blue school bag", "My school bag is [blue]. Inside it I have two books, a [pencil], and my lunch. I put the bag under my [chair] when I get to class."],
  ["Breakfast before school", "I eat [eggs] for breakfast. My sister has bread with [jam]. We drink water and leave home at [seven] in the morning."],
  ["At the fruit shop", "I'd like four [apples], please. The bananas are two euros a kilo. I take one kilo and pay in [cash]. The shop is next to the [bank]."],
  ["Where is my cat?", "My cat is small and [white]. This morning she isn't in the kitchen. I find her on my [bed]. She's sleeping next to a red [ball]."],
  ["A lesson on Tuesday", "The English lesson is on [Tuesday]. It starts at [nine]. Please bring a notebook and wait by the [door]."],
  ["The bus to the park", "Take bus number [six] to the park. Get off at the [library]. Then walk straight. You will see the park on your [left]."],
  ["A rainy afternoon", "It's [raining] today. Put on your [coat] and take an umbrella. We can play a game at [home] after lunch."],
]);

speak("A1", [
  ["Introduce yourself", "Say your name, where you are from, and where you live now. Say one thing you like. Use four short sentences."],
  ["My room", "Describe your room. Name three things in it and say where two of them are. Use words such as on, under, or next to."],
  ["Order a snack", "You are at a café. Greet the server, ask for a drink and a snack, ask the price, and say thank you."],
  ["My school morning", "Say when you get up, what you eat, and how you get to school. Use first and then to tell us the order."],
  ["A person in my family", "Talk about someone in your family. Say their name, one thing about them, and one thing you do together."],
  ["What I wear today", "Describe three things you are wearing. Say their colours and say which one you like. Use short, complete sentences."],
  ["Ask for directions", "Imagine you are lost in town. Greet someone, ask where the library is, and ask whether you can walk there."],
]);

read("A1", "A note on the fridge",
  "Hi Ben, your lunch is in the fridge. There is a cheese sandwich and an apple. Please take the blue bottle of water. I will be home at four. Mum",
  [
    ["Where is Ben's lunch?", "In his bag", "In the fridge", "On the table", 1],
    ["What kind of sandwich is it?", "Egg", "Chicken", "Cheese", 2],
    ["When will Mum be home?", "At four", "At five", "At six", 0],
  ]);

read("A1", "At the swimming pool",
  "The swimming pool is open from ten to six on Saturday. Children pay three pounds. Bring a towel. You can buy a drink at the café, but you can't take food into the pool area.",
  [
    ["When does the pool open on Saturday?", "At six", "At nine", "At ten", 2],
    ["How much do children pay?", "Three pounds", "Six pounds", "Ten pounds", 0],
    ["What should swimmers bring?", "A drink", "A towel", "Some food", 1],
  ]);

read("A1", "Mia's birthday invitation",
  "My birthday party is on Sunday at two. Come to my house at 12 Park Road. We will play games in the garden and eat cake. Please tell me on Friday if you can come.",
  [
    ["Where is the party?", "At Mia's house", "At school", "In a café", 0],
    ["What will people do in the garden?", "Have a lesson", "Play games", "Plant flowers", 1],
    ["When should you tell Mia if you can come?", "On Saturday", "On Sunday", "On Friday", 2],
  ]);

read("A1", "A lost scarf",
  "I left my green scarf on the school bus this morning. My name, Leo, is on a small label inside it. Please bring it to Room 5 if you find it. Thank you!",
  [
    ["What did Leo lose?", "A coat", "A hat", "A scarf", 2],
    ["What colour is it?", "Green", "Red", "Blue", 0],
    ["Where should you take it?", "To the office", "To Room 5", "To the bus stop", 1],
  ]);

cloze("A1", "Getting to school",
  "I get up at seven. First I eat [breakfast]. I put my books in my [bag]. I walk to school with my [friend].",
  "friend, bag, breakfast, kitchen");

cloze("A1", "A pet rabbit",
  "Eva has a pet [rabbit]. It has long [ears]. It eats a small [carrot] in the afternoon.",
  "carrot, rabbit, shoes, ears");

match("A1", "Read the signs", [
  ["Please wash your hands.", "Clean your hands here."],
  ["Library closed today.", "You cannot go into the library today."],
  ["Bus tickets sold here.", "You can buy a bus ticket here."],
  ["No bikes in the garden.", "Leave your bike outside the garden."],
]);

write("A1", [
  ["A postcard from home", 25, "Write a postcard to a friend. Say where you are, what the weather is like, and one thing you do there. Add a greeting and your name."],
  ["My favourite meal", 25, "Describe a meal you like. Name the food and drink, say when you eat it, and say who eats it with you."],
  ["Invite a classmate", 25, "Write a short message inviting a classmate to your birthday party. Say the day, the time, and the place. Ask them to reply."],
  ["My school day", 30, "Write about a school day. Say when you arrive, name a lesson you like, and describe one thing you do after school."],
  ["Describe a friend", 25, "Write about a friend. Say their name, give two details about them, and name something you like doing together."],
  ["A shopping list and a note", 25, "Write a note to someone at home. Ask them to buy three things, say how much of one thing you need, and thank them."],
  ["A photo of my family", 30, "Imagine you are sending a family photo to a pen friend. Describe where the people are and what two people are doing."],
]);

listen("A2", [
  ["Changing the dentist appointment", "This is a message from Park Dental. We have moved your appointment from Monday to [Thursday]. It is now at [half past two]. Bring your [card] and call us before [noon] if you cannot come."],
  ["Weekend train message", "The train to York will leave from platform [four], not platform two. It is running [ten] minutes late. Please keep your [ticket] with you. The café near the stairs is [closed] today."],
  ["Joining a sports club", "The sports club meets every [Wednesday] after school. We play [basketball] when it is dry and use the hall when it rains. The first session is [free]. Bring trainers and a bottle of [water]."],
  ["Cooking with friends", "First, cut the [onions] and put them in a large pan. Next, add the tomatoes and cook them for [fifteen] minutes. Before you serve the soup, add some [salt]. We have fresh [bread] to eat with it."],
  ["Hotel check-in", "Your room is on the [second] floor. The lift is opposite [reception]. Breakfast starts at seven and ends at [ten]. When you leave tomorrow, please return your [key] before eleven."],
  ["The school picnic plan", "We're meeting outside the school at [eight]. The bus will take us to the [lake]. Bring a packed lunch and a [jacket]. If it rains heavily, we'll have lunch in a [café] near the lake."],
  ["Borrowing a library book", "You can keep most books for [three] weeks. Magazines have to stay inside the [library]. To borrow a book, show the desk your [card]. You can renew a book [online] unless someone else has asked for it."],
]);

speak("A2", [
  ["Plan a day out", "Suggest a day out for you and a friend. Say where to go, how to get there, and how much one activity costs. Ask what your friend thinks."],
  ["Yesterday's shopping trip", "Tell us about a shopping trip you made recently. Say where you went, what you bought, and whether there was a problem. Use past verbs."],
  ["Compare two ways to travel", "Compare travelling to school by bus and by bike. Say which is faster for you, which you prefer, and what changes when it rains."],
  ["Explain a simple recipe", "Explain how to make a snack you know. List the ingredients and give three instructions in order. End with one piece of advice."],
  ["A phone message to change a plan", "Leave a phone message for a friend. Explain why you cannot meet at the original time, suggest a different time and place, and ask them to call back."],
  ["An enjoyable weekend", "Describe a weekend you enjoyed. Say who was with you, what you did in order, and why you would like to do one activity again."],
  ["Ask about a course", "Imagine you are calling a language school. Say which course you want, ask about the timetable and price, and explain which days you are free."],
]);

read("A2", "A new shift at the bakery",
  "Sara usually works in the bakery on Saturday morning. This week she has a driving lesson then, so her colleague Amir will open the shop. Sara will work from two to six in the afternoon. She needs to collect the shop key from Amir before his shift ends at one.",
  [
    ["Why does Sara need a different shift?", "She has a driving lesson.", "The shop opens late.", "Amir is ill.", 0],
    ["Who will open the bakery?", "Sara", "The driving teacher", "Amir", 2],
    ["What should Sara get before one?", "Her driving licence", "The shop key", "The afternoon orders", 1],
  ]);

read("A2", "A visit to the science museum",
  "Adult tickets cost eight pounds. Students pay five pounds if they show a student card. The electricity show is included in the ticket price and runs at eleven and three. On Sundays the museum café closes an hour before the museum does. You can bring lunch and eat it in the courtyard.",
  [
    ["How can a student get the lower price?", "Arrive before eleven.", "Show a student card.", "Book the electricity show.", 1],
    ["What do visitors pay extra for the show?", "Five pounds", "Eight pounds", "Nothing", 2],
    ["Where can visitors eat food from home?", "In the courtyard", "In the show room", "At the ticket desk", 0],
  ]);

read("A2", "An email about a repaired bike",
  "Hello Jo, your bike is ready. We changed the back tyre, but there was no need to change the front one. The repair costs twenty-four pounds. You can collect your bike until six today. If you come tomorrow, please arrive after ten because the shop opens late on Fridays.",
  [
    ["Which tyre did the shop change?", "The front tyre", "Both tyres", "The back tyre", 2],
    ["What is the cost of the repair?", "Twenty-four pounds", "Ten pounds", "Six pounds", 0],
    ["What should Jo do if coming on Friday?", "Come before six in the morning.", "Arrive after ten.", "Collect a new front tyre.", 1],
  ]);

read("A2", "A weekend cooking class",
  "The Saturday cookery class is for beginners. Each group makes soup and a simple dessert. The teacher provides ingredients; students should bring a box to take food home. If you cannot attend, tell the office by Thursday. You can then join a later class without paying again.",
  [
    ["Who is this class for?", "Experienced chefs", "Beginners", "Only children", 1],
    ["What should students bring?", "Ingredients for soup", "Money for dessert", "A box for the food", 2],
    ["Why tell the office by Thursday if you cannot come?", "To move your booking for free", "To collect ingredients early", "To change the menu", 0],
  ]);

cloze("A2", "A class outing",
  "The school trip was [cancelled] because the bus broke down. Our teacher [booked] a new bus for next Friday. We don't need to [pay] again, but we must bring our old [tickets].",
  "booked, pay, tickets, cancelled, dry");

cloze("A2", "A room for one night",
  "I'd like to [reserve] a room for one night. Does the price [include] breakfast? I'd like to [check] in at six. I will [leave] before nine the next morning.",
  "include, leave, reserve, close, check");

match("A2", "Messages at the train station", [
  ["This train is delayed by twenty minutes.", "The service will leave later than planned."],
  ["Please keep your luggage with you.", "Do not leave your bags alone."],
  ["Tickets are not sold on board.", "Buy your ticket before you get on."],
  ["Use the lift while the stairs are being repaired.", "Take the lift because the stairs cannot be used."],
]);

write("A2", [
  ["Move a lunch meeting", 45, "Write an email to a friend. Explain why you cannot meet on Tuesday, suggest a new day and place, and ask if the change is possible."],
  ["A trip that went wrong", 55, "Tell a short story about a trip that did not go as planned. Explain what happened, what you did next, and how the day ended."],
  ["Welcome a guest", 50, "Write a welcome message to someone staying at your home. Explain how to get there, where to find the key, and one useful rule."],
  ["Ask a sports centre about lessons", 45, "Write to a sports centre. Say what lesson you want, describe your experience, and ask two questions about the cost or timetable."],
  ["Review a local café", 55, "Write a review of a local café. Describe the food, the price, and the service. Say who might enjoy it and why."],
  ["A thank-you message", 45, "Write to someone who helped you recently. Explain what happened, how they helped, and what you would like to do for them."],
  ["Describe your plans for a holiday", 55, "Write about a holiday you are planning. Describe where you will go, how you will travel, and two activities you hope to do."],
]);

listen("B1", [
  ["A community garden announcement", "We're clearing the [west] side of the garden on Saturday. Volunteers should bring [gloves], but we'll supply the tools. If you can only stay an hour, please come in the [morning]. We'll discuss ideas for a [pond] over lunch."],
  ["An unexpected train connection", "The first part of our journey was fine, but we missed the [connection] because of a signal problem. The station manager gave us a [voucher] for lunch. We took a [coach] instead and arrived just before the [concert] began."],
  ["A library repair notice", "The upstairs reading room will be closed for [repairs] from Monday. You can still collect reserved books at the [entrance]. Extra study seats are available in the [meeting room]. The library expects to reopen upstairs by [Friday]."],
  ["Preparing for an interview", "Before the interview, check how long the [journey] takes at that time of day. Bring a copy of your [application] and prepare an example of a problem you solved. If you are going to be [late], phone the office rather than sending an [email]."],
  ["Review of a walking tour", "The guide was [enthusiastic], but some of us could not hear her in the busy square. The best part was visiting a [workshop] where people make musical instruments. I would recommend the [morning] tour because the streets are [quieter] then."],
  ["An update from the project team", "We have finished the [survey], but we still need permission to publish the results. Aisha will contact the school [office]. We will discuss the draft on [Thursday]; please read it before then and bring any [questions]."],
  ["A second-hand phone purchase", "I bought a used phone because it was cheaper and I wanted to [reduce] waste. The screen had a small [scratch], but the battery was in good condition. The shop offered a one-year [guarantee], so I kept the [receipt] in case I needed it."],
]);

speak("B1", [
  ["A problem you solved", "Tell a short story about a problem at school, work, or home. Explain what caused it, what you did, and what you would do differently next time."],
  ["A club worth joining", "Recommend a club to a new student. Describe its activities, explain how someone can join, and give two reasons it would suit a beginner."],
  ["Studying with or without music", "Explain when you study with music and when you prefer silence. Give an example from your own experience and offer advice to a friend."],
  ["A delayed delivery", "Role-play a call to a shop about a delivery that did not arrive. Explain what you ordered, ask what happened, and negotiate a new delivery time."],
  ["An activity that changed your mind", "Describe an activity you expected to dislike. Explain why you tried it, what was different from your expectations, and whether you would recommend it."],
  ["Propose a school improvement", "Suggest one practical improvement to your school. Explain the problem, describe your idea, and say how students and teachers could help."],
  ["Choose a place to live", "Compare living in a small town and a large city. Discuss transport and free time. Say which would suit you now and give an example."],
]);

read("B1", "A library of tools",
  "The town library has started lending tools as well as books. Members can borrow a drill, a ladder, or a sewing machine for a week. The first month was busy, but some tools came back without their instructions. The library now gives borrowers a short demonstration when they collect an item. Staff say the project is mainly for people who need a tool occasionally and would otherwise have to buy one.",
  [
    ["Why did the library introduce demonstrations?", "Some tools were returned without instructions.", "Borrowers wanted to buy tools.", "The project lasted only one month.", 0],
    ["Who would benefit most from the project?", "A company with its own workshop", "Someone who needs a tool only from time to time", "Someone selling new sewing machines", 1],
    ["What was the project added to?", "A shop selling books", "A training centre for builders", "The library's regular lending service", 2],
  ]);

read("B1", "A quieter route to school",
  "Bella used to cycle along the main road because it was the quickest route. When roadworks began, she tried a path through the park. It took five minutes longer, but there was less traffic and she arrived feeling calmer. After the works ended, she kept using the park route on dry days. In heavy rain, however, parts of the path become muddy, so she goes back to the main road.",
  [
    ["What first made Bella try the park route?", "A friend told her to use it.", "Roadworks started on her usual route.", "She wanted a longer ride every day.", 1],
    ["Why did she continue using it?", "It was quieter and less stressful.", "It was five minutes faster.", "It stayed dry in every kind of weather.", 0],
    ["When does she still use the main road?", "When the road is closed", "When the park is busy", "When heavy rain makes the path muddy", 2],
  ]);

read("B1", "An evening at the repair café",
  "People bring broken household objects to the repair café and sit with volunteers while they are fixed. The aim is to teach useful skills, so visitors are encouraged to take part. Last week Owen brought a lamp, expecting to leave it and return later. Instead, a volunteer showed him how to check the plug safely. Owen repaired the lamp himself and volunteered to help set up chairs at the next session.",
  [
    ["What do visitors usually do at the repair café?", "Buy replacement objects.", "Leave items at the door.", "Help with the repair and learn from volunteers.", 2],
    ["What surprised Owen?", "He was expected to stay with his lamp.", "He could not bring electrical objects.", "The café had sold his old lamp.", 0],
    ["How did Owen respond to the experience?", "He asked for a refund.", "He offered to help at a later session.", "He decided never to return.", 1],
  ]);

read("B1", "The shared office experiment",
  "A designer named Lucia tried working in a shared office instead of at home. She liked meeting people from other businesses, but conversations made it hard to concentrate on detailed drawings. At first she thought she had to choose one workplace. She now spends two days in the office for meetings and works at home when she needs quiet. She says changing her schedule worked better than asking everyone else to be silent.",
  [
    ["What did Lucia enjoy in the office?", "The chance to meet people from other businesses", "Working alone in silence", "Drawing more quickly than at home", 0],
    ["What solution did she find?", "She stopped working at home.", "She asked people to cancel meetings.", "She chose a workplace based on the task.", 2],
    ["Which task does she prefer to do at home?", "Meet new contacts", "Work on detailed drawings", "Hold team discussions", 1],
  ]);

cloze("B1", "A safer cycle route",
  "The council [introduced] a new cycle lane last spring. Some drivers were worried about delays, [although] a survey later found that journeys took the same time. More students now cycle to school, and the council plans to [extend] the route. Before work begins, it will [consult] local residents.",
  "extend, although, consult, introduced, therefore, complain");

cloze("B1", "Planning an outdoor event",
  "We agreed on a date at the first meeting, but we [postponed] the concert after seeing the weather forecast. We booked an indoor hall as a [backup]. Ticket holders received an email [explaining] the change. On the new date we arrived early to [check] the sound equipment.",
  "check, explaining, postponed, backup, repaired, counting");

match("B1", "Volunteering role descriptions", [
  ["Answer visitors' questions and show them where to go.", "Welcome people and give directions."],
  ["Check the donated books and put them in subject groups.", "Sort items before they are displayed."],
  ["Take pictures of the event for our weekly newsletter.", "Record what happened for a publication."],
  ["Call volunteers the day before to confirm their shifts.", "Contact helpers to check when they can work."],
]);

write("B1", [
  ["Request changes to a course", 85, "Write a polite email to a course organiser. Explain one difficulty with the current timetable, propose a practical change, and explain who would benefit."],
  ["A review of a useful app", 85, "Review an app that helps you learn or organise your time. Describe two features, explain one drawback, and recommend it to a specific group of users."],
  ["Reporting a lost item", 75, "Write to a transport company about something you left on a bus or train. Describe the journey and the object, explain why it matters, and ask what to do next."],
  ["An article about volunteering", 95, "Write an article for your school website about volunteering. Describe one opportunity, explain what participants can learn, and give practical advice to new volunteers."],
  ["Should homework be digital?", 95, "Write a short opinion piece on digital homework. Give one benefit and one drawback, then state your view and support it with a concrete example."],
  ["A recommendation for a visitor", 80, "Write an email to a visitor spending one day in your town. Recommend two places, explain how to travel between them, and suggest a backup plan for bad weather."],
  ["When a plan changed", 85, "Write a story about an unexpected change of plan. Set the scene, show how someone responded, and explain what the main character learned by the end."],
]);

listen("B2", [
  ["Reading a pilot study carefully", "The pilot scheme looked [promising], but its participants had all volunteered, so they were probably more motivated than average. The team plans to compare the results with a [control group] before making a recommendation. Until then, the findings should be treated as [preliminary], particularly because the study did not measure what happened after the course [ended]."],
  ["A proposal for flexible working", "I support flexible hours [in principle], but a completely unstructured system could make it harder for new staff to get help. I'd suggest a [trial period] with two shared hours each morning. We could review both customer response times and employee [feedback] before deciding whether to make the arrangement [permanent]."],
  ["The cost of reusable packaging", "Reusable boxes are more expensive to produce [initially], which is why a small deposit is charged. The environmental benefit depends on how frequently the boxes are [returned] and reused. If the return rate is too low, the system may struggle to [justify] its costs, even if customers say they support the [idea]."],
  ["Why a museum changed its labels", "Visitors had been skipping the labels because they were dense and full of technical language. As a result, the museum introduced a brief [overview] for each object, with a longer explanation available separately. The change was intended to widen [access] without losing [detail]. Early observations suggest people spend [longer] in the galleries now."],
  ["A discussion about evening bus services", "The survey suggests that many residents would use a later bus, though demand is [uneven] across the town. Rather than adding a service on every route, the operator could [extend] two of the busiest ones first. A fare reduction might encourage people to try them, but [reliability] will matter more if the aim is to change travel habits in the [long term]."],
  ["A poor crop and a better plan", "After two unusually dry summers, the farm switched to varieties that could tolerate a [shortage] of water. The new plants produced less in the first season, but their yield was more [consistent] across different fields. The manager now measures success over several years, rather than judging the change on a [single harvest]. That approach allows for weather [variation]."],
  ["Balancing accessibility and cost", "Moving the meeting online would remove some travel [barriers], but it might disadvantage people with unreliable internet access. The committee is considering a [hybrid] event, provided that the venue can support good sound. The extra expense needs to be [weighed] against the wider participation it could [enable]."],
]);

speak("B2", [
  ["Should cities charge drivers to enter?", "Present a balanced argument for and against charging drivers to enter a city centre. Explain who might be affected differently and propose one condition for a fair policy."],
  ["Defend a change of plan", "You are leading a team project that is behind schedule. Explain why you want to change its scope, respond to a possible objection, and suggest how the team can judge whether the change worked."],
  ["Relying on product reviews", "Discuss how far online reviews can be trusted. Compare two ways of assessing a review's reliability and conclude with advice for someone making an expensive purchase."],
  ["Develop a school phone policy", "Imagine a school is reviewing its phone policy. Consider learning, emergencies, and fairness. Propose a rule that balances two competing concerns and defend it with an example."],
  ["Respond to a proposal for a four-day week", "Summarise the likely benefits and drawbacks of a four-day working week for two different groups. Say what evidence you would want before recommending a permanent change."],
  ["A difficult environmental trade-off", "A nature reserve wants to increase visitor numbers to fund conservation. Explain the competing goals, compare two possible approaches, and give a reasoned recommendation."],
  ["Evaluate an idea that did not work", "Describe an idea that sounded convincing but failed in practice. Distinguish between the idea itself and how it was implemented. Explain which lesson could transfer to another situation."],
]);

read("B2", "Remote work and the limits of a survey",
  "A company found that staff working from home reported fewer interruptions. Managers initially took this as evidence that productivity had risen. However, the survey did not measure the amount or quality of work, and people who chose to work remotely tended to be in roles with fewer meetings. A follow-up study will compare people doing similar tasks and collect several measures of performance. The researchers do not reject the earlier result, but they argue that it answers a narrower question than managers assumed.",
  [
    ["Why might the managers' initial conclusion be too strong?", "Nobody reported fewer interruptions.", "The survey measured interruptions rather than productivity directly.", "Remote staff did more meetings than office staff.", 1],
    ["What problem does comparing similar tasks help address?", "Differences in the kinds of jobs staff do", "Changes to the survey's language", "A lack of employees working at home", 0],
    ["What is the researchers' attitude towards the earlier result?", "They think it proves remote work is ineffective.", "They regard it as false and irrelevant.", "They accept it but limit what can be inferred from it.", 2],
  ]);

read("B2", "The empty shop experiment",
  "A town offered vacant shops to artists for short exhibitions. The first evaluation celebrated a rise in foot traffic, yet nearby traders reported little change in sales. Interviews suggested that many visitors came specifically for the exhibitions and left immediately afterwards. Instead of cancelling the project, the council coordinated later events with the local shops' opening hours and added a shared programme. The revised scheme was judged on whether visitors explored the area, as well as on how many people turned up.",
  [
    ["What did the first evaluation overlook?", "The total number of visitors", "The availability of empty shops", "Whether visitors engaged with other local businesses", 2],
    ["Why did the council coordinate the later events with shop hours?", "To give visitors more opportunity to explore nearby shops", "To make sure exhibitions ended before shops opened", "To replace the artists with traders", 0],
    ["How did the standard of success change?", "It was reduced to reporting sales figures only.", "It took visitor behaviour as well as attendance into account.", "It excluded foot traffic entirely.", 1],
  ]);

read("B2", "A repair guarantee with an unexpected effect",
  "A retailer extended the repair guarantee on its refurbished laptops. It expected buyers to value the protection if a fault occurred. Interviews revealed another effect: people interpreted a longer guarantee as a signal that the retailer trusted its own repairs. Customers who had previously avoided refurbished devices were therefore more willing to consider them. The guarantee still cost money to provide, but the retailer argues that its value cannot be assessed by counting repair claims alone.",
  [
    ["What extra effect did the guarantee have?", "It prevented all faults from occurring.", "It caused customers to ask for shorter repair times.", "It increased confidence in the quality of the devices.", 2],
    ["Who changed their behaviour?", "People who had previously avoided refurbished devices", "Customers who had already made several repair claims", "Technicians who refused to repair laptops", 0],
    ["What does the final sentence suggest?", "Repair claims provide a complete measure of value.", "The guarantee can influence purchasing as well as repairs.", "The guarantee has no measurable cost.", 1],
  ]);

read("B2", "When a small park looks untidy",
  "A parks department stopped mowing part of a public lawn so that wildflowers could establish themselves. The longer grass attracted more insects, but residents complained that the site appeared neglected. The department began mowing narrow edges and placed signs explaining the experiment. Complaints fell even though most of the grass remained long. The staff concluded that some opposition had been about signs of maintenance rather than about the ecological aim itself.",
  [
    ["What remained largely the same after the department responded?", "The number of complaints", "The length of the grass across most of the site", "The public's explanation of the scheme", 1],
    ["What did the new signs do?", "They explained the reasoning behind the change.", "They asked people to avoid the park.", "They promised to cut all the grass again.", 0],
    ["What point does the example illustrate?", "Ecological projects succeed only if nobody notices them.", "Most residents were opposed to attracting insects.", "Visible signs of care can change how an ecological project is interpreted.", 2],
  ]);

cloze("B2", "What a trial can tell us",
  "The trial was [designed] to measure whether a reminder changed attendance. It did not [establish] why particular students responded, so the results cannot be used to predict habit changes. [Nevertheless], the figures justify a larger study. The next phase will compare groups across schools to see whether the effect can be [replicated].",
  "replicated, establish, nevertheless, designed, contradicted, likewise");

cloze("B2", "A decision with limited evidence",
  "The committee acknowledged that the evidence was [inconclusive]. Rather than approve a permanent change, it funded a short [pilot]. The results will be [reviewed] against criteria agreed in advance. The plan will be expanded only if the benefits [outweigh] the costs.",
  "outweigh, conclusive, pilot, reviewed, inconclusive, postpone");

match("B2", "How to read research claims", [
  ["The researchers found a link but did not identify its cause.", "The evidence shows an association, not an explanation."],
  ["The results apply only to the schools that took part.", "The findings may not generalise to other settings."],
  ["The report draws on interviews and attendance figures.", "The researchers combined two kinds of evidence."],
  ["The second study found a similar pattern with new participants.", "The finding was reproduced in a separate sample."],
]);

write("B2", [
  ["Report on a quiet study area", 125, "Write a report proposing a quiet study area at school. Describe the problem, compare two possible locations, and recommend one based on access, cost, and likely use."],
  ["An opinion essay on remote working", 140, "Discuss whether employees should be able to choose where they work. Compare benefits and drawbacks for workers and employers. Address an objection before reaching a conclusion."],
  ["Formal complaint about a cancelled course", 110, "Write to a training provider after a course was cancelled with little notice. Summarise what happened, explain its impact, and request a specific and reasonable remedy."],
  ["Evaluate a school sustainability project", 130, "Write an evaluation report for a school committee. Describe the aims and observed results of a sustainability project, identify one limitation in the evidence, and propose a measurable next step."],
  ["When tourism helps or harms a neighbourhood", 140, "Write an article for a neighbourhood newsletter. Compare two effects of tourism on local residents and propose one policy that preserves benefits while reducing harm."],
  ["A proposal for better public transport", 125, "Write a proposal for a town council. Compare adding an evening bus route with offering cheaper tickets. Explain who would benefit and how the council could measure success."],
  ["Review a documentary's argument", 125, "Write a review of a documentary you have seen, or invent a plausible one. Summarise its main claim, evaluate how it uses evidence, discuss one missing perspective, and say who would benefit from watching it."],
]);

type Identity = Pick<CreateExerciseInput, "level" | "skill" | "topic"> & { type: string };

function exerciseKey({ level, skill, type, topic }: Identity) {
  return JSON.stringify([level, skill, type, topic]);
}

function validateLibrary(raw: unknown) {
  if (!Array.isArray(raw) || raw.length === 0) throw new Error("File JSON phải chứa một mảng bài tập.");

  const keys = new Set<string>();
  return raw.map((row, index) => {
    const parsed = createExerciseSchema.safeParse(row);
    if (!parsed.success) {
      throw new Error("Bài số " + (index + 1) + ": " + parsed.error.issues.map((issue) => issue.message).join("; "));
    }

    const exercise = parsed.data;
    const checked = validateExercise(exercise.type, exercise.content, exercise.answer);
    if (!checked.success) {
      throw new Error(exercise.topic + ": " + formatValidationErrors(checked.errors));
    }

    if (exercise.type === "listening_fill") {
      const { script, blanks } = checked.data.content as { script: string; blanks: number };
      if (countBlanks(script) !== blanks) throw new Error(exercise.topic + ": số chỗ trống trong script bị sai.");
    }

    const key = exerciseKey(exercise);
    if (keys.has(key)) throw new Error("Bài bị trùng trong JSON: " + exercise.topic);
    keys.add(key);
    return { ...exercise, ...checked.data };
  });
}

type ValidatedLibrary = ReturnType<typeof validateLibrary>;

async function importLibrary(rows: ValidatedLibrary, email: string) {
  const db = new PrismaClient();
  try {
    return await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('englishai-practice-library-import'))`;

      const admin = await tx.user.findFirst({
        where: { email, role: "ADMIN", status: "ACTIVE" },
        select: { id: true },
      });
      if (!admin) throw new Error("Email phải là của quản trị viên đang hoạt động trong cơ sở dữ liệu.");

      const topics = [...new Set(rows.map(({ topic }) => topic))];
      const existing = await tx.exercise.findMany({
        where: { topic: { in: topics } },
        select: { level: true, skill: true, type: true, topic: true },
      });
      const existingKeys = new Set(existing.map(exerciseKey));
      const newRows = rows.filter((row) => !existingKeys.has(exerciseKey(row)));

      if (newRows.length > 0) {
        await tx.exercise.createMany({
          data: newRows.map(({ type, skill, level, topic, content, answer, explanation, publish }) => ({
            type,
            skill,
            level,
            topic,
            content: content as Prisma.InputJsonValue,
            answer: answer === null ? Prisma.DbNull : (answer as Prisma.InputJsonValue),
            explanation,
            createdById: admin.id,
            source: "ADMIN",
            status: publish === true ? "PUBLISHED" : "DRAFT",
            inLibrary: publish === true,
          })),
        });
      }

      return { created: newRows.length, skipped: rows.length - newRows.length };
    }, { timeout: 30_000 });
  } finally {
    await db.$disconnect();
  }
}

async function main() {
  const [mode, email] = process.argv.slice(2);

  if (mode === "--export") {
    const rows = validateLibrary(exercises);
    if (rows.length !== 112) throw new Error("Bộ dữ liệu cần đúng 112 bài.");
    for (const level of ["A1", "A2", "B1", "B2"]) {
      for (const skill of ["LISTENING", "SPEAKING", "READING", "WRITING"]) {
        const count = rows.filter((row) => row.level === level && row.skill === skill).length;
        if (count !== 7) throw new Error(level + " " + skill + ": cần đúng 7 bài.");
      }
    }
    await writeFile(jsonFile, JSON.stringify(rows, null, 2) + "\n", "utf8");
    console.log("Đã tạo " + jsonFile + " với " + rows.length + " bài.");
    return;
  }

  if (mode !== "--import" || !email?.trim()) {
    throw new Error("Dùng --export để tạo JSON hoặc --import email-admin để nhập.");
  }

  const raw: unknown = JSON.parse((await readFile(jsonFile, "utf8")).replace(/^\uFEFF/, ""));
  const rows = validateLibrary(raw);
  const { created, skipped } = await importLibrary(rows, email.trim().toLowerCase());
  console.log("Đã tạo " + created + " bài. Đã bỏ qua " + skipped + " bài có sẵn.");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});