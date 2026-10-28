/** A real screenshot from `public/docs`, with its size so the page never jumps while it loads. */
export type Shot = { src: string; width: number; height: number; alt: string; caption?: string };

export type Guide = {
  id: string;
  title: string;
  /** One sentence: what the person gets from this guide. */
  lead: string;
  steps: string[];
  shot?: Shot;
  /** Short notes that save a wrong turn. */
  tips?: string[];
};

const shot = (name: string, width: number, height: number, alt: string, caption?: string): Shot => ({ src: `/docs/${name}.webp`, width, height, alt, caption });

/** The guides, in the order a new person meets them: watch one, make one, read what the AI did, share it. */
export const GUIDES: Guide[] = [
  {
    id: "watch-a-replay",
    title: "Watch a replay",
    lead: "See a finished analysis from start to end, without an account.",
    steps: [
      "Open Explore and pick a shared project. Hover a card to play its preview.",
      "The replay opens in the same layout as the studio: lanes on the left, the preview in the middle, data products on the right and the timeline along the bottom.",
      "Press play, or drag the playhead. Each data product shows its value at that moment, so you can watch it build up.",
      "Click a dot on the timeline to open that file in the preview and read what the model found in it.",
    ],
    shot: shot("replay", 1600, 900, "A shared replay of the Moira Close crane build: lanes on the left, a site photo in the preview, data product cards on the right and the timeline below.", "A replay on Explore. The footer says it made 0 new model calls."),
    tips: [
      "A replay reads only what was recorded, so watching it never calls a model and costs nothing.",
      "Pictures appear only if the owner chose to share them. Otherwise you see the rows and the steps, but not the media.",
    ],
  },
  {
    id: "create-a-project",
    title: "Create a project",
    lead: "Start from the question you want answered and the data products that answer it.",
    steps: [
      "Sign in, open Projects and choose New project.",
      "Start from a template, or open the catalog and pick data products one by one.",
      "Name the project. It opens in ARGUS Studio, where you add lanes.",
    ],
    shot: shot("new-project", 1600, 900, "The New project screen with a project name field and templates such as Bridge Monitoring Alert and Crowd Insight."),
    tips: [
      "The catalog lists every data product with its level and status. Only products marked Supported can be added today; Planned and Research ones show what comes next.",
    ],
  },
  {
    id: "browse-the-catalog",
    title: "Pick data products from the catalog",
    lead: "A data product is one answer, such as a count, a trend or an alert, with its rows and one chart.",
    steps: [
      "Filter the catalog by category, level or status.",
      "Open a product to see what it reads, what it computes and which lane analyzer it needs.",
      "Add it to the project. You can add more later from the studio's Products window.",
    ],
    shot: shot("catalog", 1600, 900, "The data product catalog with cards grouped by category, each showing its type, level and status."),
  },
  {
    id: "add-a-lane",
    title: "Add a lane",
    lead: "Everything comes into a project through a lane, so a lane is the first thing you make.",
    steps: [
      "In the studio, choose + Lane.",
      "Say in plain words what goes in it, for example \"site photos from the crane camera\", and choose Suggest lane. The model names the lane, picks its input and analyzer, and links it to the products it can feed.",
      "Check the suggestion and save it. If you prefer, choose set it up yourself and fill in the same fields by hand.",
      "Code checks every link: a lane that cannot feed a product is not linked to it.",
    ],
    shot: shot("lane-form", 896, 520, "The New lane form with a plain-words description and the Suggest lane button."),
    tips: [
      "A lane takes one kind of input: files, a screen share, a weather feed, a simulated sensor or a webhook.",
      "File lanes run one analyzer: find objects, read a body, or read a screen.",
    ],
  },
  {
    id: "drop-files",
    title: "Drop files on a lane",
    lead: "Drop pictures or video straight on a lane card. The lane reads each one and writes its findings as rows.",
    steps: [
      "Drag files from your computer onto the lane card, or click the card to choose them.",
      "Each file shows as a thumbnail. Hollow means waiting, filled means read, and a cross means it failed.",
      "When a file has been read, the products linked to the lane update. Their cards show how many rows came from it.",
    ],
    shot: shot("lanes", 896, 374, "The Lanes window with lane cards, each with its analyzer badge, its thumbnails and the products it feeds."),
    tips: [
      "Pictures: JPG, PNG and WebP. Video: MP4, MOV and WebM, up to 500 MB per file.",
      "Video is sampled into frames in your browser, so nothing is re-encoded on the server.",
      "Live lanes, such as weather or a sensor, ask for their setup in the card and then bring their own rows.",
    ],
  },
  {
    id: "read-the-studio",
    title: "Read the studio",
    lead: "One project on one screen: what came in, what the AI made of it, and what it adds up to.",
    steps: [
      "Lanes (left): every input, with its files and status.",
      "Preview (middle): the selected file and the objects the model named in it. Below it, How the AI read it tells the story of that file step by step.",
      "Data products (right): each card shows its value at the playhead and a small trend. Expand several at once to compare, and drag the divider to give them more room.",
      "Timeline (bottom): the whole run, playable. Click a dot to open that file.",
    ],
    shot: shot("studio", 1600, 900, "ARGUS Studio for the Moira Close crane build: lanes, preview, data products and timeline on one screen."),
    tips: [
      "The middle panels can be minimized or maximized from their bars. A double-click on a bar restores both.",
      "Each product card can download its rows as CSV.",
    ],
  },
  {
    id: "timeline-modes",
    title: "Use the timeline",
    lead: "Choose how much of the AI's work the timeline shows.",
    steps: [
      "Simple shows one dot per file, bars for live lanes, and a row of markers where a product changed.",
      "Lane steps opens each lane into its steps: the file comes in, the AI reads it, code checks the result, and rows go out.",
      "Everything shows every recorded step, with a line per product.",
    ],
    shot: shot("timeline", 1600, 300, "The timeline in Lane steps mode, with each lane opened into its in, AI read, checked and out steps."),
    tips: ["Your choice of mode is remembered on this device. Replays open in Lane steps."],
  },
  {
    id: "observatory",
    title: "See every step in the Observatory",
    lead: "Nothing the AI does is hidden. The Observatory lists every model call, code step and tool it used.",
    steps: [
      "Choose Observatory in the studio top bar, or open in Observatory under a file's story.",
      "Filter by All, Model, Code, Tool or Failed.",
      "Open a step to see which model ran, what went in, what came out, the tokens it used and the rows it wrote.",
    ],
    shot: shot("observatory", 896, 836, "The Observatory window listing model calls, code steps and tools, with token counts and the rows each step wrote."),
    tips: ["Pictures are recorded by their size only, and no keys or full files are ever stored in a step."],
  },
  {
    id: "manage-products",
    title: "Manage data products",
    lead: "Add, remove and link products after the project is made.",
    steps: [
      "Choose Products in the studio top bar, or + Product on the right rail.",
      "Add a product from the catalog, or remove one you no longer need.",
      "Link a product to a lane that can feed it. Products that no lane can feed say so.",
    ],
    shot: shot("products-window", 896, 836, "The Products window listing the project's data products and the lanes linked to each."),
  },
  {
    id: "ask-argus",
    title: "Ask ARGUS",
    lead: "Ask questions about your projects in plain words, and see where each number came from.",
    steps: [
      "Choose Ask ARGUS in the top bar (or press ⌘J / Ctrl+J) and type a question, or pick a suggested one.",
      "Type @ to narrow the question to one or more projects.",
      "The model chooses what to look up, code computes every number, and the answer shows each lookup it made.",
    ],
    shot: shot("ask", 414, 884, "The Ask ARGUS chat with an @project tag, suggested questions and an answer that cites its sources."),
    tips: ["Ask ARGUS answers questions only. Setting up lanes and products stays in the studio."],
  },
  {
    id: "present",
    title: "Present your projects",
    lead: "Projects is for reading results: each project is one full-screen slide.",
    steps: [
      "Open Projects and scroll through your projects. Each slide shows its data products and how many lanes feed them.",
      "Choose Present to go full screen. Choose Open in Studio to change the setup.",
    ],
    shot: shot("projects", 1600, 900, "The Projects page with one project shown as a full-screen slide of its data products."),
  },
  {
    id: "share",
    title: "Share a replay",
    lead: "Make a project public on Explore so anyone can watch its replay.",
    steps: [
      "Choose Share in the studio top bar, or from the project's ⋯ menu on Projects.",
      "Copy the link. Anyone with it can watch the replay without signing in.",
      "Turn on Show media only if you have the right to publish the pictures. Turning it off again deletes the frames kept for the public page.",
      "Choose Stop sharing to take the project off Explore.",
    ],
    shot: shot("share", 512, 325, "The Share dialog with the public link, the Show media switch and Stop sharing."),
    tips: ["Body lanes are never shown in public, even with Show media on."],
  },
];

export type Faq = { question: string; answer: string };
export type FaqSection = { id: string; title: string; items: Faq[] };

export const FAQ: FaqSection[] = [
  {
    id: "faq-basics",
    title: "Basics",
    items: [
      { question: "What is ARGUS?", answer: "ARGUS uses Meta AI models to turn what you bring in, such as photos, video, a screen or a live feed, into data products: counts, trends and alerts you can chart, download and share. Every step the AI takes is recorded so you can check it." },
      { question: "Do I need an account?", answer: "Not to watch. Every replay on Explore opens without signing in. To make your own project, sign in. The sign-in page lists demo users you can try." },
      { question: "What is a data product?", answer: "One answer with its rows and one chart, for example people counted per hour, or how far a build has come. A product says which kind of rows it reads, so ARGUS knows which lanes can feed it." },
      { question: "What is a lane?", answer: "One input into a project: one kind of file, or one live feed. A lane runs one analyzer and feeds the products it is linked to. Everything comes in through a lane." },
      { question: "What is an Observation?", answer: "A single recorded finding, such as \"a truck at 82% confidence in this frame\" or \"temperature 14°C at 10:02\". Every number in a data product is computed from Observations, so you can trace it back." },
    ],
  },
  {
    id: "faq-ai",
    title: "How the AI works",
    items: [
      { question: "Which models does ARGUS use?", answer: "Muse Spark reads each picture, frame or screen and names what is in it. When a data product needs to know where things are, SAM 3.1 finds each named object and outlines it. The model that ran is named on every step in the Observatory and in the replay." },
      { question: "Does the AI compute the numbers?", answer: "No. Models propose, code computes. A model says what it sees; plain code checks it, writes Observations, and works out every count, average and trend from them." },
      { question: "How accurate are the results?", answer: "As good as what the model saw. Counts from pictures are estimates and are labelled that way. Open a file in the preview, or a step in the Observatory, to check what the model found before you rely on a number." },
      { question: "Why do some pictures have outlines and others not?", answer: "Muse Spark names what it sees but does not say where it is. Outlines come from SAM 3.1, which ARGUS calls only when a product needs positions, such as Object footprint or Density heatmap. Each call is paid, so pictures in lanes that do not feed those products are named only, and ARGUS never draws a box it would have to guess." },
      { question: "Does watching a replay call a model?", answer: "No. A replay reads only what was recorded. It shows 0 new model calls and costs nothing, however many people watch it." },
    ],
  },
  {
    id: "faq-data",
    title: "Your data and privacy",
    items: [
      { question: "Who can see my project?", answer: "Only you, until you share it. Sharing puts the replay on Explore, and you choose whether the pictures go with it." },
      { question: "Are body photos ever public?", answer: "No. Lanes that read a body are always locked in a public replay, even with Show media on. Only their rows and steps are shown, never the pictures." },
      { question: "What goes into a step's record?", answer: "The model, what went in and what came out, tokens used and the rows written. Pictures are recorded by their size only, text is kept short, and keys or full files are never stored." },
      { question: "Can I download my data?", answer: "Yes. Every data product card in the studio downloads its rows as CSV, and shared replays offer the same rows to anyone watching." },
      { question: "What may I upload?", answer: "Pictures (JPG, PNG, WebP) and video (MP4, MOV, WebM) up to 500 MB each, that you have the right to use. Only share media publicly if you may publish it." },
    ],
  },
];
