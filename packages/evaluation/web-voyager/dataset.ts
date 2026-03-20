/**
 * WebVoyager benchmark dataset
 * Source: https://github.com/MinorJerry/WebVoyager
 *
 * Full dataset has 643 tasks across 15 websites.
 * We select a representative subset for evaluation.
 */

export interface WebVoyagerTask {
  id: string;
  web_name: string;
  web: string;
  ques: string;
}

export interface ReferenceAnswer {
  id: string;
  type: 'golden' | 'possible';
  ans: string;
}

/**
 * Curated 30-task subset (2 per website) for quick evaluation.
 * Selection criteria:
 * - One "golden" (deterministic answer) + one "possible" (dynamic) per site where available
 * - Avoids time-sensitive tasks (flights, hotel prices)
 * - Covers diverse interaction patterns (search, filter, navigate, extract)
 */
export const WEBVOYAGER_SUBSET_30: WebVoyagerTask[] = [
  // Allrecipes
  {
    id: 'Allrecipes--3',
    web_name: 'Allrecipes',
    web: 'https://www.allrecipes.com/',
    ques: 'Search for a recipe of Beef Wellington on Allrecipes that has more than 200 reviews and a rating of at least 4.5 stars. List the main ingredients required for the recipe.',
  },
  {
    id: 'Allrecipes--10',
    web_name: 'Allrecipes',
    web: 'https://www.allrecipes.com/',
    ques: 'I want to make vegetarian lasagna, find a recipe that has a rating of 4 stars or more and uses zucchini as one of the ingredients.',
  },

  // Amazon
  {
    id: 'Amazon--10',
    web_name: 'Amazon',
    web: 'https://www.amazon.com/',
    ques: 'Find the cost of a 2-year protection plan for a PS4 on Amazon.',
  },
  {
    id: 'Amazon--20',
    web_name: 'Amazon',
    web: 'https://www.amazon.com/',
    ques: 'Search for a wireless ergonomic keyboard with backlighting on Amazon. Filter the results to show only items with a rating of 4 stars and above, priced between $40 and $60.',
  },

  // Apple
  {
    id: 'Apple--5',
    web_name: 'Apple',
    web: 'https://www.apple.com/',
    ques: 'How much does it cost to buy a MacBook Pro 16-inch with M3 Max chip, 16-core CPU, 40-core GPU, 64GB memory, and 1TB SSD on the Apple website?',
  },
  {
    id: 'Apple--15',
    web_name: 'Apple',
    web: 'https://www.apple.com/',
    ques: 'Tell me about the trade-in value of an iPhone 13 Pro Max on the Apple website.',
  },

  // ArXiv
  {
    id: 'ArXiv--5',
    web_name: 'ArXiv',
    web: 'https://arxiv.org/',
    ques: 'Find the paper "Attention Is All You Need" on ArXiv and tell me how many citations it has according to Semantic Scholar (linked from the ArXiv page).',
  },
  {
    id: 'ArXiv--15',
    web_name: 'ArXiv',
    web: 'https://arxiv.org/',
    ques: 'Search for the paper titled "GPT-4 Technical Report" on ArXiv. Tell me when version 3 of this paper was submitted.',
  },

  // BBC News
  {
    id: 'BBC News--5',
    web_name: 'BBC News',
    web: 'https://www.bbc.com/news',
    ques: 'Find the latest headlines under the "Technology" section on BBC News.',
  },
  {
    id: 'BBC News--20',
    web_name: 'BBC News',
    web: 'https://www.bbc.com/news',
    ques: 'Find a BBC News article about climate change. Summarize the key points of the article.',
  },

  // Cambridge Dictionary
  {
    id: 'Cambridge Dictionary--5',
    web_name: 'Cambridge Dictionary',
    web: 'https://dictionary.cambridge.org/',
    ques: 'Look up the word "sustainability" in the Cambridge Dictionary and provide its pronunciation and definition.',
  },
  {
    id: 'Cambridge Dictionary--15',
    web_name: 'Cambridge Dictionary',
    web: 'https://dictionary.cambridge.org/',
    ques: 'Find three different meanings of the word "dog" in the Cambridge Dictionary.',
  },

  // Coursera
  {
    id: 'Coursera--5',
    web_name: 'Coursera',
    web: 'https://www.coursera.org/',
    ques: 'Find a course on Coursera that teaches Python for beginners. Provide the course name, duration, and rating.',
  },
  {
    id: 'Coursera--20',
    web_name: 'Coursera',
    web: 'https://www.coursera.org/',
    ques: 'Search for machine learning courses on Coursera offered by Stanford University. List the available courses.',
  },

  // ESPN
  {
    id: 'ESPN--10',
    web_name: 'ESPN',
    web: 'https://www.espn.com/',
    ques: "Check out LeBron James' Stats on ESPN to see how many games he has played in his career.",
  },
  {
    id: 'ESPN--25',
    web_name: 'ESPN',
    web: 'https://www.espn.com/',
    ques: 'Find the current NBA standings on ESPN. Which team is at the top of the Eastern Conference?',
  },

  // GitHub
  {
    id: 'GitHub--5',
    web_name: 'GitHub',
    web: 'https://github.com/',
    ques: 'Search for the repository "facebook/react" on GitHub and tell me the number of stars it has.',
  },
  {
    id: 'GitHub--15',
    web_name: 'GitHub',
    web: 'https://github.com/',
    ques: 'Find the latest release of the "microsoft/vscode" repository on GitHub. What is the version number?',
  },

  // Google Map
  {
    id: 'Google Map--5',
    web_name: 'Google Map',
    web: 'https://www.google.com/maps/',
    ques: 'Find the distance by car from San Francisco to Los Angeles using Google Maps.',
  },
  {
    id: 'Google Map--20',
    web_name: 'Google Map',
    web: 'https://www.google.com/maps/',
    ques: 'Search for Chinese restaurants near Times Square in New York on Google Maps. Find one that has a rating of 4 stars or more.',
  },

  // Google Search
  {
    id: 'Google Search--5',
    web_name: 'Google Search',
    web: 'https://www.google.com/',
    ques: 'What is the population of Tokyo, Japan according to a Google Search?',
  },
  {
    id: 'Google Search--20',
    web_name: 'Google Search',
    web: 'https://www.google.com/',
    ques: 'What is the current exchange rate of US Dollar to Euro according to Google Search?',
  },

  // Hugging Face
  {
    id: 'Huggingface--5',
    web_name: 'Huggingface',
    web: 'https://huggingface.co/',
    ques: 'Find the model "meta-llama/Llama-2-7b" on Hugging Face. How many downloads does it have?',
  },
  {
    id: 'Huggingface--20',
    web_name: 'Huggingface',
    web: 'https://huggingface.co/',
    ques: 'Search for text-to-image models on Hugging Face. Which model has the most likes?',
  },

  // Wolfram Alpha
  {
    id: 'Wolfram Alpha--5',
    web_name: 'Wolfram Alpha',
    web: 'https://www.wolframalpha.com/',
    ques: 'What is the integral of x^2 * sin(x) according to Wolfram Alpha?',
  },
  {
    id: 'Wolfram Alpha--20',
    web_name: 'Wolfram Alpha',
    web: 'https://www.wolframalpha.com/',
    ques: 'Ask Wolfram Alpha: What is the distance from Earth to Mars?',
  },
];

/**
 * Extended 75-task subset (5 per website) for thorough evaluation.
 * Includes the 30-task subset plus additional tasks.
 */
export const WEBVOYAGER_SUBSET_75: WebVoyagerTask[] = [
  ...WEBVOYAGER_SUBSET_30,

  // Additional Allrecipes
  {
    id: 'Allrecipes--20',
    web_name: 'Allrecipes',
    web: 'https://www.allrecipes.com/',
    ques: 'Find a chicken soup recipe on Allrecipes that can be prepared in under 30 minutes. List the ingredients.',
  },
  {
    id: 'Allrecipes--30',
    web_name: 'Allrecipes',
    web: 'https://www.allrecipes.com/',
    ques: 'Search for gluten-free dessert recipes on Allrecipes. What is the top-rated one?',
  },
  {
    id: 'Allrecipes--35',
    web_name: 'Allrecipes',
    web: 'https://www.allrecipes.com/',
    ques: 'Find a pancake recipe on Allrecipes with more than 1000 reviews. What is the calorie count per serving?',
  },

  // Additional Amazon
  {
    id: 'Amazon--5',
    web_name: 'Amazon',
    web: 'https://www.amazon.com/',
    ques: 'Find a Blue iPhone 12 Pro 128GB on Amazon and tell me the price.',
  },
  {
    id: 'Amazon--30',
    web_name: 'Amazon',
    web: 'https://www.amazon.com/',
    ques: 'Search for noise-canceling headphones on Amazon with a rating of 4.5 stars or above. List the top 3 results with prices.',
  },
  {
    id: 'Amazon--35',
    web_name: 'Amazon',
    web: 'https://www.amazon.com/',
    ques: 'Find the return policy for electronics on Amazon. What is the return window?',
  },

  // Additional Apple
  {
    id: 'Apple--25',
    web_name: 'Apple',
    web: 'https://www.apple.com/',
    ques: 'Compare the prices of the iPhone 14 Pro and the iPhone 15 Pro on the Apple website.',
  },
  {
    id: 'Apple--30',
    web_name: 'Apple',
    web: 'https://www.apple.com/',
    ques: 'What are the color options available for the MacBook Air M3 on the Apple website?',
  },
  {
    id: 'Apple--35',
    web_name: 'Apple',
    web: 'https://www.apple.com/',
    ques: 'Find the battery life specifications for the Apple Watch Ultra 2 on the Apple website.',
  },

  // Additional ArXiv
  {
    id: 'ArXiv--25',
    web_name: 'ArXiv',
    web: 'https://arxiv.org/',
    ques: 'Search for the most recent papers on "large language models" on ArXiv. List the titles of the first 3 results.',
  },
  {
    id: 'ArXiv--30',
    web_name: 'ArXiv',
    web: 'https://arxiv.org/',
    ques: 'How many figures and tables are in the paper "On the Sentence Embeddings from Pre-trained Language Models" on ArXiv?',
  },
  {
    id: 'ArXiv--35',
    web_name: 'ArXiv',
    web: 'https://arxiv.org/',
    ques: 'Find papers by Yann LeCun on ArXiv from 2023. How many are there?',
  },

  // Additional BBC News
  {
    id: 'BBC News--10',
    web_name: 'BBC News',
    web: 'https://www.bbc.com/news',
    ques: 'Find the latest news in the "Science & Environment" section of BBC News. What is the top headline?',
  },
  {
    id: 'BBC News--30',
    web_name: 'BBC News',
    web: 'https://www.bbc.com/news',
    ques: 'Find the BBC News section for "Business". What are the top 3 headlines?',
  },
  {
    id: 'BBC News--35',
    web_name: 'BBC News',
    web: 'https://www.bbc.com/news',
    ques: 'Navigate to the BBC Sport section and find the latest football (soccer) results.',
  },

  // Additional Cambridge Dictionary
  {
    id: 'Cambridge Dictionary--25',
    web_name: 'Cambridge Dictionary',
    web: 'https://dictionary.cambridge.org/',
    ques: 'What is the difference between "affect" and "effect" according to Cambridge Dictionary?',
  },
  {
    id: 'Cambridge Dictionary--30',
    web_name: 'Cambridge Dictionary',
    web: 'https://dictionary.cambridge.org/',
    ques: 'Find the word of the day on the Cambridge Dictionary website.',
  },
  {
    id: 'Cambridge Dictionary--35',
    web_name: 'Cambridge Dictionary',
    web: 'https://dictionary.cambridge.org/',
    ques: 'Look up the word "algorithm" in Cambridge Dictionary. What example sentences are provided?',
  },

  // Additional Coursera
  {
    id: 'Coursera--10',
    web_name: 'Coursera',
    web: 'https://www.coursera.org/',
    ques: 'Find a free course about data science on Coursera. What is its name and who offers it?',
  },
  {
    id: 'Coursera--30',
    web_name: 'Coursera',
    web: 'https://www.coursera.org/',
    ques: "Search for Andrew Ng's courses on Coursera. List the courses that are available.",
  },
  {
    id: 'Coursera--35',
    web_name: 'Coursera',
    web: 'https://www.coursera.org/',
    ques: 'What professional certificates does Google offer on Coursera? List them.',
  },

  // Additional ESPN
  {
    id: 'ESPN--5',
    web_name: 'ESPN',
    web: 'https://www.espn.com/',
    ques: 'Find the NFL team standings on ESPN. Which team has the best record in the NFC?',
  },
  {
    id: 'ESPN--30',
    web_name: 'ESPN',
    web: 'https://www.espn.com/',
    ques: "Find Stephen Curry's career statistics on ESPN. What is his career 3-point shooting percentage?",
  },
  {
    id: 'ESPN--35',
    web_name: 'ESPN',
    web: 'https://www.espn.com/',
    ques: 'Check the current Premier League table on ESPN. Who is leading the league?',
  },

  // Additional GitHub
  {
    id: 'GitHub--25',
    web_name: 'GitHub',
    web: 'https://github.com/',
    ques: 'Find the repository "openai/openai-python" on GitHub. What is the latest version?',
  },
  {
    id: 'GitHub--30',
    web_name: 'GitHub',
    web: 'https://github.com/',
    ques: 'Search for trending repositories in Python on GitHub today. List the top 3.',
  },
  {
    id: 'GitHub--35',
    web_name: 'GitHub',
    web: 'https://github.com/',
    ques: 'Find the number of contributors to the "torvalds/linux" repository on GitHub.',
  },

  // Additional Google Map
  {
    id: 'Google Map--10',
    web_name: 'Google Map',
    web: 'https://www.google.com/maps/',
    ques: 'Find the walking time from Central Park to the Empire State Building using Google Maps.',
  },
  {
    id: 'Google Map--30',
    web_name: 'Google Map',
    web: 'https://www.google.com/maps/',
    ques: 'Search for coffee shops near the Golden Gate Bridge on Google Maps. What are the top-rated ones?',
  },
  {
    id: 'Google Map--35',
    web_name: 'Google Map',
    web: 'https://www.google.com/maps/',
    ques: 'Find the opening hours of the Metropolitan Museum of Art on Google Maps.',
  },

  // Additional Google Search
  {
    id: 'Google Search--10',
    web_name: 'Google Search',
    web: 'https://www.google.com/',
    ques: 'Who won the Nobel Prize in Physics in 2023 according to Google Search?',
  },
  {
    id: 'Google Search--30',
    web_name: 'Google Search',
    web: 'https://www.google.com/',
    ques: 'What is the height of Mount Everest according to Google Search?',
  },
  {
    id: 'Google Search--35',
    web_name: 'Google Search',
    web: 'https://www.google.com/',
    ques: 'When was the Eiffel Tower built according to Google Search?',
  },

  // Additional Hugging Face
  {
    id: 'Huggingface--10',
    web_name: 'Huggingface',
    web: 'https://huggingface.co/',
    ques: 'Find the dataset "squad" on Hugging Face. How many rows does the training set have?',
  },
  {
    id: 'Huggingface--30',
    web_name: 'Huggingface',
    web: 'https://huggingface.co/',
    ques: 'Search for the most downloaded model on Hugging Face. What is it?',
  },
  {
    id: 'Huggingface--35',
    web_name: 'Huggingface',
    web: 'https://huggingface.co/',
    ques: 'Find the Hugging Face Spaces page. What is the most liked Space?',
  },

  // Additional Wolfram Alpha
  {
    id: 'Wolfram Alpha--10',
    web_name: 'Wolfram Alpha',
    web: 'https://www.wolframalpha.com/',
    ques: 'What is the derivative of ln(x^2 + 1) according to Wolfram Alpha?',
  },
  {
    id: 'Wolfram Alpha--30',
    web_name: 'Wolfram Alpha',
    web: 'https://www.wolframalpha.com/',
    ques: 'Ask Wolfram Alpha: What is the population of France?',
  },
  {
    id: 'Wolfram Alpha--35',
    web_name: 'Wolfram Alpha',
    web: 'https://www.wolframalpha.com/',
    ques: 'Solve the equation 2x^2 + 3x - 5 = 0 using Wolfram Alpha.',
  },
];

/**
 * All 15 websites in WebVoyager
 */
export const WEBVOYAGER_WEBSITES = [
  'Allrecipes',
  'Amazon',
  'Apple',
  'ArXiv',
  'BBC News',
  'Booking',
  'Cambridge Dictionary',
  'Coursera',
  'ESPN',
  'GitHub',
  'Google Flights',
  'Google Map',
  'Google Search',
  'Huggingface',
  'Wolfram Alpha',
] as const;
