// src/pages/LandingPage.jsx
import React from "react";
import logo from "../assets/images/logo 1.PNG";

// ASCII-only punctuation to avoid mojibake in some environments.

const NavBar = () => (
  <header className="sticky top-0 z-40 bg-white/90 backdrop-blur border-b border-gray-200">
    <div className="container mx-auto flex items-center justify-between px-4 sm:px-6 py-3">
      <a href="/landing" className="flex items-center gap-2">
        <img src={logo} alt="Rad Mentor" className="h-8 w-8" />
        <span className="font-semibold text-gray-900">Rad Mentor</span>
      </a>
      <nav className="hidden md:flex items-center gap-6 text-sm text-gray-700">
        <a href="#features" className="hover:text-blue-700">Features</a>
        <a href="#how-it-works" className="hover:text-blue-700">How It Works</a>
        <a href="#ai-tutor" className="hover:text-blue-700">AI Tutor</a>
        <a href="#roadmap" className="hover:text-blue-700">Our Roadmap</a>
      </nav>
      <div className="flex items-center gap-3">
        <a href="/login" className="text-sm text-gray-700 hover:text-blue-700">Login</a>
        <a href="/login" className="inline-flex items-center rounded-lg bg-blue-600 text-white px-4 py-2 text-sm font-semibold shadow hover:bg-blue-700">Plan Your Radiology Theory Prep Free</a>
      </div>
    </div>
  </header>
);

const Hero = () => (
  <section className="bg-gradient-to-b from-blue-50 to-white">
    <div className="container mx-auto px-4 sm:px-6 py-14">
      <div className="grid lg:grid-cols-2 gap-10 items-center">
        <div>
          <h1 className="text-4xl md:text-5xl font-extrabold text-gray-900">The Smartest Way to Conquer Your Radiology Theory Exam.</h1>
          <p className="mt-4 text-lg text-gray-700">Stop juggling notes and textbooks. Rad Mentor builds a structured, daily study plan to help you systematically cover the entire Radiology Theory syllabus and master topics with our AI-powered tutor.</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <a href="/login" className="inline-flex items-center rounded-lg bg-blue-600 text-white px-5 py-3 font-semibold shadow hover:bg-blue-700">Start Your Radiology Theory Plan - It's Free</a>
            <a href="#how-it-works" className="inline-flex items-center rounded-lg border border-gray-300 text-gray-800 px-5 py-3 font-semibold hover:bg-gray-50">See How It Works</a>
          </div>
        </div>
        <div className="rounded-2xl border bg-white shadow-sm p-4">
          <div className="aspect-[16/9] w-full overflow-hidden rounded-lg border bg-gray-900/5 flex items-center justify-center">
            <video
              src={require("../assets/media/Planner video.mp4")}
              title="Rad Mentor planner walkthrough"
              className="h-full w-full object-cover"
              autoPlay
              muted
              loop
              playsInline
            />
          </div>
          <div className="mt-3 text-xs text-gray-500 text-center">Map out your Radiology Theory syllabus - Master high-yield topics</div>
        </div>
      </div>
    </div>
  </section>
);

const CredBar = () => (
  <section className="border-y bg-white">
    <div className="container mx-auto px-4 sm:px-6 py-6">
      <div className="text-center text-sm text-gray-600">Trusted by radiology residents and aspirants across India</div>
      <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-10 rounded bg-gray-100 border flex items-center justify-center text-gray-400 text-xs">Institution Logo</div>
        ))}
      </div>
    </div>
  </section>
);

const Problems = () => (
  <section id="problems" className="bg-white">
    <div className="container mx-auto px-4 sm:px-6 py-14">
      <h2 className="text-2xl md:text-3xl font-extrabold text-gray-900 text-center">The Radiology Theory Exam is a Challenge. Your Preparation Shouldn't Be Chaos.</h2>
      <div className="mt-10 grid md:grid-cols-3 gap-6">
        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-blue-50 text-blue-600 text-2xl" role="img" aria-label="Books">
            {"\u{1F4DA}"}
          </span>
          <div className="mt-3 text-lg font-semibold text-gray-900">Vast Syllabus</div>
          <p className="mt-1 text-gray-600 text-sm">Feeling overwhelmed trying to cover the vast Radiology Theory syllabus while managing intense clinical work?</p>
        </div>
        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-indigo-50 text-indigo-600 text-2xl" role="img" aria-label="Calendar">
            {"\u{1F4C6}"}
          </span>
          <div className="mt-3 text-lg font-semibold text-gray-900">Unpredictable Schedule</div>
          <p className="mt-1 text-gray-600 text-sm">Struggling to follow a fixed schedule due to unpredictable duties, leaving massive backlogs before exam leave?</p>
        </div>
        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-rose-50 text-rose-600 text-2xl" role="img" aria-label="Question mark">
            {"\u{2753}"}
          </span>
          <div className="mt-3 text-lg font-semibold text-gray-900">Lack of Guidance</div>
          <p className="mt-1 text-gray-600 text-sm">Unsure if you're focusing on the right topics or how to track your progress against the entire syllabus?</p>
        </div>
      </div>
    </div>
  </section>
);

const Features = () => (
  <section id="features" className="bg-gray-50">
    <div className="container mx-auto px-4 sm:px-6 py-14">
      <h2 className="text-2xl md:text-3xl font-extrabold text-gray-900 text-center">Plan • Learn • Test — The Complete Radiology Theory Cycle</h2>
      <div className="mt-10 grid lg:grid-cols-3 gap-6">
        {[
          {
            tag: "PLAN WITH PRECISION",
            benefit: "Smart Planner + Weekly Board",
            desc: "Set your exam date, daily load, and section priorities. The master plan, weekly board, and day caps keep every topic mapped out and adjustable for residency realities.",
          },
          {
            tag: "LEARN WITH GUIDANCE",
            benefit: "AI Socratic Tutor Sessions",
            desc: "Work through high-yield theory with an AI tutor that explains, questions, evaluates, and summarizes—building real conceptual mastery instead of passive reading.",
          },
          {
            tag: "TEST WITH CONFIDENCE",
            benefit: "Question Banks + AI Feedback",
            desc: "Solve curated question papers, benchmark yourself, and get instant AI feedback on written answers so you know exactly where to refine before exam day.",
          },
        ].map((f, idx) => (
          <div key={idx} className="rounded-xl border bg-white p-6 shadow-sm">
            <div className="text-xs uppercase tracking-wide text-blue-700 font-semibold">{f.tag}</div>
            <div className="mt-2 text-lg font-bold text-gray-900">{f.benefit}</div>
            <p className="mt-2 text-sm text-gray-600">{f.desc}</p>
          </div>
        ))}
      </div>
    </div>
  </section>
);

const TutorSpotlight = () => (
  <section id="ai-tutor" className="bg-white">
    <div className="container mx-auto px-4 sm:px-6 py-14">
      <div className="grid lg:grid-cols-2 gap-8 items-center">
        <div>
          <h3 className="text-2xl md:text-3xl font-extrabold text-gray-900">Master High-yield Radiology Theory Topics with Your AI Tutor.</h3>
          <p className="mt-3 text-gray-700">Our AI tutor, powered by Google's Gemini AI, helps you build deep conceptual clarity - critical for the Radiology Theory exam's application-based questions. Go from passive reading to active, engaged learning.</p>
          <div className="mt-5">
            <a href="/login" className="inline-flex items-center rounded-lg bg-blue-600 text-white px-4 py-2 text-sm font-semibold shadow hover:bg-blue-700">Try the AI Tutor</a>
          </div>
        </div>
          <div className="rounded-xl border bg-white p-4 shadow-sm">
            <video
              src={require("../assets/media/Tutor Video.mp4")}
              title="AI Tutor in action"
              className="aspect-[16/9] w-full rounded-lg border object-cover"
              autoPlay
              muted
              loop
              playsInline
            />
          </div>
      </div>
    </div>
  </section>
);

const Roadmap = () => (
  <section id="roadmap" className="bg-gray-50">
    <div className="container mx-auto px-4 sm:px-6 py-14">
      <h3 className="text-2xl md:text-3xl font-extrabold text-gray-900 text-center">Starting with Radiology Theory, Expanding for All.</h3>
      <ol className="mt-8 space-y-6">
        {[
          { label: "Now", text: "Radiology Theory Exam: Our platform is currently optimized to help you ace the Radiology Theory exam." },
          { label: "Next", text: "MD Theory Exams: We are actively developing modules and plan templates for MD exams, starting with MUHS and expanding to other major universities." },
          { label: "Future", text: "More Specialties & Exams: Our vision is to bring smart planning and AI learning to every postgraduate medical student in India." },
        ].map((i, idx) => (
          <li key={idx} className="relative pl-10">
            <span className="absolute left-0 top-1 h-6 w-6 rounded-full border-2 border-blue-600 text-blue-700 text-xs font-bold flex items-center justify-center">{i.label}</span>
            <p className="text-gray-700">{i.text}</p>
          </li>
        ))}
      </ol>
    </div>
  </section>
);

const Pricing = () => (
  <section id="pricing" className="bg-white">
    <div className="container mx-auto px-4 sm:px-6 py-14">
      <div className="rounded-lg bg-blue-50 border border-blue-100 p-3 text-sm text-blue-800 text-center font-medium">Try Our Premium AI Tutor - Free for 7 Days! All new accounts get a one-week trial to experience AI-powered learning.</div>
      <h3 className="mt-6 text-2xl md:text-3xl font-extrabold text-gray-900 text-center">A Plan for Every Radiology Theory Aspirant.</h3>
      <div className="mt-8 grid md:grid-cols-3 gap-6">
        <div className="rounded-2xl border bg-white p-6 shadow-sm">
          <div className="text-xs uppercase tracking-wide text-blue-700 font-semibold">Free Demo (7-Day Access)</div>
          <div className="mt-2 text-3xl font-extrabold text-gray-900">Rs 0 <span className="text-base font-medium text-gray-500">/ 7 days</span></div>
          <p className="mt-2 text-gray-700">Full access to the planner and AI tutor for an entire week. Build your schedule, test the tutor, and see the workflow end to end.</p>
          <ul className="mt-4 space-y-2 text-sm text-gray-700 list-disc list-inside">
            <li>Plan setup wizard, weekly board, and master queue</li>
            <li>Unlimited AI Socratic tutor sessions</li>
            <li>Question banks and solved papers with instant feedback</li>
          </ul>
          <a href="/login" className="mt-6 inline-flex items-center rounded-lg bg-blue-600 text-white px-4 py-2 text-sm font-semibold shadow hover:bg-blue-700">Start Your Free Demo</a>
        </div>
        <div className="rounded-2xl border-2 border-blue-600 bg-white p-6 shadow">
          <div className="text-xs uppercase tracking-wide text-blue-700 font-semibold">Rad Mentor Full Access</div>
          <div className="mt-2 text-3xl font-extrabold text-gray-900">Rs 49,999 <span className="text-base font-medium text-gray-500">/ year</span></div>
          <p className="mt-2 text-gray-700">All-in access for a full year—plan, learn, and test with every AI feature unlocked.</p>
          <div className="mt-3 text-sm text-green-700 font-semibold">Launch offer: 50% off for the first 100 users</div>
          <div className="text-sm text-gray-500">Upgrade early and pay Rs 24,999 for your first year.</div>
          <ul className="mt-4 space-y-2 text-sm text-gray-700 list-disc list-inside">
            <li><span className="mr-2 inline-block h-2 w-2 rounded-full bg-green-500"></span> Lifetime planner + AI tutor access</li>
            <li><span className="mr-2 inline-block h-2 w-2 rounded-full bg-green-500"></span> Unlimited question banks with model answers</li>
            <li><span className="mr-2 inline-block h-2 w-2 rounded-full bg-green-500"></span> AI feedback on every written response</li>
          </ul>
          <a href="/login" className="mt-6 inline-flex items-center rounded-lg bg-blue-600 text-white px-4 py-2 text-sm font-semibold shadow hover:bg-blue-700">Upgrade to Full Access</a>
        </div>
        <div className="rounded-2xl border bg-white p-6 shadow-sm">
          <div className="text-xs uppercase tracking-wide text-blue-700 font-semibold">Refer & Extend</div>
          <div className="mt-2 text-3xl font-extrabold text-gray-900">+1 Month <span className="text-base font-medium text-gray-500">per referral</span></div>
          <p className="mt-2 text-gray-700">Invite a friend to Rad Mentor and earn an extra month of full-access time for both of you when they upgrade.</p>
          <ul className="mt-4 space-y-2 text-sm text-gray-700 list-disc list-inside">
            <li><span className="mr-2 inline-block h-2 w-2 rounded-full bg-green-500"></span> Share your unique referral link</li>
            <li><span className="mr-2 inline-block h-2 w-2 rounded-full bg-green-500"></span> Friend activates the full-access plan</li>
            <li><span className="mr-2 inline-block h-2 w-2 rounded-full bg-green-500"></span> Both accounts receive one additional month</li>
          </ul>
          <a href="/login" className="mt-6 inline-flex items-center rounded-lg bg-blue-600 text-white px-4 py-2 text-sm font-semibold shadow hover:bg-blue-700">Refer a Friend</a>
        </div>
      </div>
    </div>
  </section>
);

const FAQ = () => (
  <section id="faq" className="bg-gray-50">
    <div className="container mx-auto px-4 sm:px-6 py-14">
      <h3 className="text-2xl md:text-3xl font-extrabold text-gray-900 text-center">Frequently Asked Questions</h3>
      <div className="mt-8 space-y-3">
        {[
          {
            q: "Who is this for? Is it only for the Radiology Theory exam?",
            a: "Our initial launch is laser-focused on the Radiology Theory Exam. We are already working on MD (MUHS) and other university exams next. Check our roadmap!",
          },
          {
            q: "Does this cover practicals or viva?",
            a: "Currently, Rad Mentor is designed to help you master the vast syllabus for your theory exam. While a strong theoretical foundation is crucial for practicals, we do not have specific features for case presentations or viva preparation at this time.",
          },
          {
            q: "Can I use this if I am an MD student?",
            a: "Absolutely! While our current messaging is focused on the Radiology Theory exam, the planning tools are flexible and can be used by anyone. You can set up a custom plan for your university's syllabus. Official MD exam templates are coming soon!",
          },
        ].map((item, idx) => (
          <details key={idx} className="group rounded-lg border bg-white p-4 open:shadow-sm">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2">
              <span className="font-medium text-gray-900">{item.q}</span>
              <span className="text-gray-500 group-open:rotate-180 transition">v</span>
            </summary>
            <p className="mt-2 text-sm text-gray-700">{item.a}</p>
          </details>
        ))}
      </div>
    </div>
  </section>
);

const HowItWorks = () => (
  <section id="how-it-works" className="bg-white">
    <div className="container mx-auto px-4 sm:px-6 py-14">
      <h2 className="text-2xl md:text-3xl font-extrabold text-gray-900 text-center">How It Works</h2>
      <div className="mt-8 grid gap-6 items-center grid-cols-1 md:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr]">
        <div className="rounded-xl border bg-white p-6 text-center shadow-sm">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-blue-50 text-blue-600 text-2xl" role="img" aria-label="Checklist">
            {"\u{1F4DD}"}
          </span>
          <div className="mt-2 font-semibold text-gray-900">Create Your Plan</div>
          <p className="mt-1 text-sm text-gray-600">Answer a few questions - dates, pacing, and focus areas.</p>
        </div>
        <div className="hidden md:flex items-center justify-center text-gray-400 text-xl" aria-hidden="true">
          {"\u{2192}"}
        </div>
        <div className="rounded-xl border bg-white p-6 text-center shadow-sm">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-indigo-50 text-indigo-600 text-2xl" role="img" aria-label="Calendar board">
            {"\u{1F4C5}"}
          </span>
          <div className="mt-2 font-semibold text-gray-900">Execute Weekly</div>
          <p className="mt-1 text-sm text-gray-600">Use the Weekly Planner to stay on track and adapt.</p>
        </div>
        <div className="hidden md:flex items-center justify-center text-gray-400 text-xl" aria-hidden="true">
          {"\u{2192}"}
        </div>
        <div className="rounded-xl border bg-white p-6 text-center shadow-sm">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-purple-50 text-purple-600 text-2xl" role="img" aria-label="Robot">
            {"\u{1F916}"}
          </span>
          <div className="mt-2 font-semibold text-gray-900">Learn with AI</div>
          <p className="mt-1 text-sm text-gray-600">Master high-yield topics via our Socratic tutor.</p>
        </div>
        <div className="hidden md:flex items-center justify-center text-gray-400 text-xl" aria-hidden="true">
          {"\u{2192}"}
        </div>
        <div className="rounded-xl border bg-white p-6 text-center shadow-sm">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-amber-50 text-amber-600 text-2xl" role="img" aria-label="Trophy">
            {"\u{1F3C6}"}
          </span>
          <div className="mt-2 font-semibold text-gray-900">Track & Succeed</div>
          <p className="mt-1 text-sm text-gray-600">See progress and finish strong before exam leave.</p>
        </div>
      </div>
      <div className="mt-4 flex md:hidden justify-center text-gray-400 text-xl" aria-hidden="true">
        <span>{"\u{2193}"}</span>
      </div>
    </div>
  </section>
);

export default function LandingPage() {
  return (
    <div className="font-inter">
      <NavBar />
      <Hero />
      <CredBar />
      <HowItWorks />
      <Problems />
      <Features />
      <TutorSpotlight />
      <Roadmap />
      <Pricing />
      <FAQ />
      <section className="bg-gradient-to-r from-blue-600 to-indigo-600">
        <div className="container mx-auto px-4 sm:px-6 py-14 text-center">
          <h3 className="text-3xl font-extrabold text-white">Walk into Your Radiology Theory Exam with Confidence.</h3>
          <p className="mt-2 text-blue-100">Build a structured study plan, keep your progress synced, and learn with AI-powered tutoring designed for radiology residents preparing for the Radiology Theory exam.</p>
          <a href="/login" className="mt-6 inline-flex items-center rounded-lg bg-white text-blue-700 px-6 py-3 text-sm font-semibold shadow hover:bg-blue-50">Start Your Free Radiology Theory Plan Today</a>
        </div>
      </section>
      <footer className="border-t bg-white">
        <div className="container mx-auto px-4 sm:px-6 py-6 text-xs text-gray-500 flex items-center justify-between">
          <span>(c) {new Date().getFullYear()} Rad Mentor</span>
          <a className="hover:text-blue-700" href="/login">Login</a>
        </div>
      </footer>
    </div>
  );
}



