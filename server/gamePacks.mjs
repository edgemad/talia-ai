// 📦 Game catalogue — downloadable packs for the Arcade.
// Packs are PURE DATA (quiz banks, word banks, prompt packs) that plug into
// the server's data-driven engines (quiz / scramble / llm-rounds). They are
// validated by validatePack() on install; no code is ever executed from here.
//
// Adding a pack: append an entry — it instantly appears in the in-app
// catalogue under "Get more games".

export const CATALOGUE = [
  // ---------- quiz packs ----------
  {
    id: "space-quiz",
    engine: "quiz",
    name: "Space Quiz",
    emoji: "🚀",
    tagline: "Blast off through 12 cosmic questions",
    category: "Quiz",
    ages: "8+",
    howTo: "Answer with the letter or the word.",
    data: {
      questions: [
        { q: "Which planet is known as the Red Planet?", choices: ["Mars", "Venus", "Jupiter", "Mercury"], answer: "Mars", fact: "Mars looks red because its dust is full of iron oxide — rust!" },
        { q: "What galaxy do we live in?", choices: ["Andromeda", "The Milky Way", "The Whirlpool", "Triangulum"], answer: "The Milky Way", aliases: ["milky way", "the milky way"], fact: "It holds over 100 billion stars — and the Sun is just one." },
        { q: "Who was the first human in space?", choices: ["Neil Armstrong", "Yuri Gagarin", "Buzz Aldrin", "Sally Ride"], answer: "Yuri Gagarin", fact: "He orbited Earth in 1961 — the flight lasted 108 minutes." },
        { q: "What is the Sun?", choices: ["A planet", "A star", "A comet", "A moon"], answer: "A star", fact: "The Sun is a middle-aged star about 4.6 billion years old." },
        { q: "Which planet has the most rings?", choices: ["Saturn", "Mars", "Earth", "Venus"], answer: "Saturn", fact: "Saturn has thousands of ringlets made of ice and rock." },
        { q: "What do we call a rock that burns up in Earth's atmosphere?", choices: ["Asteroid", "Meteor", "Comet", "Moon"], answer: "Meteor", aliases: ["shooting star", "meteor"], fact: "If it lands on the ground, it's called a meteorite." },
        { q: "How many moons does Mars have?", choices: ["0", "1", "2", "12"], answer: "2", fact: "They're named Phobos and Deimos — fear and dread!" },
        { q: "What force keeps planets in orbit?", choices: ["Magnetism", "Gravity", "Wind", "Friction"], answer: "Gravity", fact: "Gravity gets weaker with distance — that's why far moons orbit slowly." },
        { q: "Which planet is famous for its giant storm?", choices: ["Jupiter", "Neptune", "Mercury", "Uranus"], answer: "Jupiter", fact: "Jupiter's Great Red Spot is a storm bigger than Earth!" },
        { q: "What was the first animal to orbit Earth?", choices: ["A dog", "A cat", "A monkey", "A mouse"], answer: "A dog", aliases: ["dog", "laika"], fact: "Laika the dog flew aboard Sputnik 2 in 1957." },
        { q: "What is at the center of our solar system?", choices: ["Earth", "The Moon", "The Sun", "Jupiter"], answer: "The Sun", fact: "Everything in the solar system orbits the Sun." },
        { q: "What planet spins on its side?", choices: ["Uranus", "Saturn", "Mars", "Venus"], answer: "Uranus", fact: "Uranus rolls around the Sun like a bowling ball!" },
      ],
    },
  },
  {
    id: "animal-quiz",
    engine: "quiz",
    name: "Animal Quiz",
    emoji: "🦁",
    tagline: "12 wild questions about amazing animals",
    category: "Quiz",
    ages: "6+",
    howTo: "Answer with the letter or the word.",
    data: {
      questions: [
        { q: "Which animal is the tallest?", choices: ["Elephant", "Giraffe", "Moose", "Camel"], answer: "Giraffe", fact: "Giraffes can be 5.5 m tall — as high as a single-story house!" },
        { q: "How many legs does a spider have?", choices: ["6", "8", "10", "12"], answer: "8", aliases: ["eight"], fact: "Spiders are arachnids, not insects — insects have 6 legs." },
        { q: "Which is the fastest land animal?", choices: ["Lion", "Cheetah", "Horse", "Ostrich"], answer: "Cheetah", fact: "Cheetahs sprint up to 110 km/h for short bursts." },
        { q: "What do you call a baby kangaroo?", choices: ["Cub", "Joey", "Kit", "Pup"], answer: "Joey", fact: "Newborn joeys are the size of a jellybean!" },
        { q: "Which animal sleeps standing up?", choices: ["Horse", "Dog", "Cat", "Rabbit"], answer: "Horse", fact: "Horses can lock their legs to doze without falling." },
        { q: "What is a group of wolves called?", choices: ["Herd", "Pack", "Flock", "School"], answer: "Pack", fact: "Wolf packs are families — parents and their pups." },
        { q: "Which bird can't fly but swims brilliantly?", choices: ["Eagle", "Penguin", "Parrot", "Owl"], answer: "Penguin", fact: "Penguins 'fly' underwater at up to 35 km/h." },
        { q: "What is the biggest animal ever?", choices: ["Elephant", "Blue whale", "T-Rex", "Giraffe"], answer: "Blue whale", fact: "A blue whale's heart is the size of a small car." },
        { q: "How many hearts does an octopus have?", choices: ["1", "2", "3", "8"], answer: "3", fact: "Two pump blood to the gills, one to the rest of the body." },
        { q: "Which animal never sleeps?", choices: ["Bullfrog", "Dolphin", "Sloth", "Owl"], answer: "Bullfrog", aliases: ["frog", "bullfrog"], fact: "Bullfrogs rest but never truly fall asleep — scientists tested it!" },
        { q: "What do bees make?", choices: ["Milk", "Honey", "Silk", "Wax paper"], answer: "Honey", fact: "One bee makes only 1/12 teaspoon of honey in its life." },
        { q: "Which animal has black and white fur and loves bamboo?", choices: ["Raccoon", "Panda", "Skunk", "Lemur"], answer: "Panda", fact: "Pandas eat up to 38 kg of bamboo every day!" },
      ],
    },
  },
  {
    id: "brain-teasers",
    engine: "quiz",
    name: "Brain Teasers",
    emoji: "🧠",
    tagline: "12 tricky logic questions for sharp minds",
    category: "Quiz",
    ages: "10+",
    howTo: "Say or type your answer.",
    data: {
      questions: [
        { q: "If you have 3 apples and take away 2, how many do you have?", answer: "2", aliases: ["two", "2 apples", "the 2 you took"], fact: "YOU took them — so you have the 2 you took!" },
        { q: "What comes next: 1, 1, 2, 3, 5, 8, ...?", answer: "13", aliases: ["thirteen"], fact: "Each number is the sum of the two before it — the Fibonacci sequence!" },
        { q: "A farmer has 17 sheep. All but 9 run away. How many are left?", answer: "9", aliases: ["nine"], fact: "'All but 9' means 9 stayed!" },
        { q: "How many months have 28 days?", answer: "All", aliases: ["all of them", "12", "twelve", "every month"], fact: "Every month has at least 28 days!" },
        { q: "If two's company and three's a crowd, what are four and five?", answer: "9", aliases: ["nine", "nine!"], fact: "4 + 5 = 9 — a classic joke riddle." },
        { q: "What weighs more: a kilogram of feathers or a kilogram of rocks?", choices: ["Feathers", "Rocks", "They weigh the same", "Depends"], answer: "They weigh the same", aliases: ["same", "they are the same", "equal"], fact: "A kilogram is a kilogram — however fluffy!" },
        { q: "I add 5 to 9 and get 2. How?", choices: ["On a clock", "In binary", "Modulo", "It's impossible"], answer: "On a clock", aliases: ["clock", "on a clock", "time", "12-hour clock"], fact: "9 o'clock + 5 hours = 2 o'clock!" },
        { q: "What number do you get when you multiply all numbers on a phone keypad?", answer: "0", aliases: ["zero", "zero!"], fact: "There's a 0 on the keypad — anything times 0 is 0." },
        { q: "Two fathers and two sons went fishing. They caught 3 fish, one each. How is that possible?", answer: "Grandfather, father, son", aliases: ["grandfather father son", "3 people", "grandpa dad and son", "they are grandfather father and son"], fact: "A grandfather, his son, and his grandson — only three people." },
        { q: "Which letter has the most water?", answer: "C", aliases: ["the letter c", "c (sea)"], fact: "The letter C sounds like 'sea'!" },
        { q: "If a plane crashes on the border of two countries, where do you bury the survivors?", choices: ["Country A", "Country B", "Half each", "You don't"], answer: "You don't", aliases: ["you dont bury survivors", "survivors are alive", "you don't", "dont"], fact: "Survivors are alive — you don't bury them!" },
        { q: "Forward I am heavy, backward I am not. What am I?", answer: "ton", aliases: ["the word ton", "a ton"], fact: "'ton' backward is 'not'!" },
      ],
    },
  },

  // ---------- scramble packs ----------
  {
    id: "animal-scramble",
    engine: "scramble",
    name: "Animal Scramble",
    emoji: "🐘",
    tagline: "Unjumble 15 animal names",
    category: "Words",
    ages: "6+",
    howTo: "Type the unscrambled animal.",
    data: {
      words: [
        { word: "elephant", hint: "Big ears, long trunk" },
        { word: "tiger", hint: "Striped big cat" },
        { word: "monkey", hint: "Loves bananas and trees" },
        { word: "dolphin", hint: "Clever ocean mammal" },
        { word: "penguin", hint: "Tuxedo bird" },
        { word: "rabbit", hint: "Long ears, hops" },
        { word: "turtle", hint: "Carries its house" },
        { word: "zebra", hint: "Striped horse" },
        { word: "koala", hint: "Sleepy eucalyptus eater" },
        { word: "shark", hint: "Ocean's famous fin" },
        { word: "camel", hint: "Desert ship" },
        { word: "otter", hint: "Holds hands while floating" },
        { word: "falcon", hint: "Fastest diver in the sky" },
        { word: "hedgehog", hint: "Little spikeball" },
        { word: "octopus", hint: "Eight clever arms" },
      ],
    },
  },
  {
    id: "space-scramble",
    engine: "scramble",
    name: "Space Scramble",
    emoji: "🛸",
    tagline: "Unjumble 12 cosmic words",
    category: "Words",
    ages: "7+",
    howTo: "Type the unscrambled word.",
    data: {
      words: [
        { word: "rocket", hint: "Rides fire to space" },
        { word: "planet", hint: "Orbits a star" },
        { word: "galaxy", hint: "Billions of stars together" },
        { word: "meteor", hint: "Shooting star" },
        { word: "orbit", hint: "A path around a planet" },
        { word: "comet", hint: "Icy ball with a tail" },
        { word: "saturn", hint: "Ringed giant" },
        { word: "nebula", hint: "Where stars are born" },
        { word: "astronaut", hint: "Space traveler" },
        { word: "telescope", hint: "Star watcher" },
        { word: "gravity", hint: "Keeps your feet down" },
        { word: "eclipse", hint: "When shadows cross the sky" },
      ],
    },
  },

  // ---------- prompt packs (need an LLM) ----------
  {
    id: "would-you-rather",
    engine: "llm-rounds",
    name: "Would You Rather",
    emoji: "🤗",
    tagline: "Silly choices — explain your pick!",
    category: "Story",
    ages: "6+",
    needsLlm: true,
    howTo: "Pick one and say why; Talia asks the next one.",
    data: {
      maxRounds: 10,
      intro: "I ask 'would you rather' questions, you choose and tell me why — then I ask the next one!",
      system:
        "You are the host of Would You Rather for a kid. Each turn: react warmly to their choice and reason (1 sentence), then ask the NEXT question in the form 'Would you rather [A] or [B]?' Keep it silly and imaginative — animals, superpowers, desserts, space, magic. Never repeat a question you already asked. Keep replies under 40 words. On the final round ({{round}} of {{maxRounds}}), react, then declare them the Champion of Choices 🏆 and ask if they want to play again.",
    },
  },
  {
    id: "joke-corner",
    engine: "llm-rounds",
    name: "Joke Corner",
    emoji: "🤡",
    tagline: "Trade jokes — best laugh wins",
    category: "Story",
    ages: "6+",
    needsLlm: true,
    howTo: "Tell a joke or say 'your turn'; Talia tells one back.",
    data: {
      maxRounds: 8,
      intro: "Welcome to Joke Corner! Tell me a joke, or say 'your turn' — we'll see who's funniest!",
      system:
        "You are the host of Joke Corner, trading jokes with a kid. Each turn: react to their joke (a short warm laugh or groan, even if it's silly), rate it playfully out of 10, then tell ONE clean, kid-friendly joke of your own (setup, pause with '...', punchline). Never repeat a joke. Keep replies under 50 words. On the final round ({{round}} of {{maxRounds}}), announce the Joke Champion 🏆 and ask if they want another round.",
    },
  },
];
