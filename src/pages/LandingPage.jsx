// src/pages/LandingPage.jsx
import React from "react";
import logo from "../assets/images/logo 1.PNG";

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
        <a href="/login" className="inline-flex items-center rounded-lg bg-blue-600 text-white px-4 py-2 text-sm font-semibold shadow hover:bg-blue-700">Plan Your DNB Prep Free</a>
      </div>
    </div>
  </header>
);

const Hero = () => (
  <section className="bg-gradient-to-b from-blue-50 to-white">
    <div className="container mx-auto px-4 sm:px-6 py-14">
      <div className="grid lg:grid-cols-2 gap-10 items-center">
        <div>
          <h1 className="text-4xl md:text-5xl font-extrabold text-gray-900">The Smartest Way to Conquer Your DNB Theory Exam.</h1>
          <p className="mt-4 text-lg text-gray-700">Stop juggling notes and textbooks. Rad Mentor builds a structured, daily study plan to help you systematically cover the entire DNB syllabus and master topics with our AI-powered tutor.</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <a href="/login" className="inline-flex items-center rounded-lg bg-blue-600 text-white px-5 py-3 font-semibold shadow hover:bg-blue-700">Start Your DNB Plan â€” Itâ€™s Free</a>
            <a href="#how-it-works" className="inline-flex items-center rounded-lg border border-gray-300 text-gray-800 px-5 py-3 font-semibold hover:bg-gray-50">See How It Works</a>
          </div>
        </div>
        <div className="rounded-2xl border bg-white shadow-sm p-4">
          <div className="aspect-[16/9] w-full rounded-lg bg-gray-100 border flex items-center justify-center text-gray-500">
            App preview / GIF placeholder
          </div>
          <div className="mt-3 text-xs text-gray-500 text-center">Map out your DNB syllabus â€¢ Master highâ€‘yield topics</div>
        </div>
      </div>
    </div>
  </section>
);

const CredBar = () => (
  <section className="border-y bg-white">
    <div className="container mx-auto px-4 sm:px-6 py-6">
      <div className="text-center text-sm text-gray-600">Trusted by DNB residents and aspirants across India</div>
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
      <h2 className="text-2xl md:text-3xl font-extrabold text-gray-900 text-center">The DNB Theory Exam is a Challenge. Your Preparation Shouldnâ€™t Be Chaos.</h2>
      <div className="mt-10 grid md:grid-cols-3 gap-6">
        {[{
          icon: "ðŸ“š", title: "Vast Syllabus", text: "Feeling overwhelmed trying to cover the vast DNB theory syllabus while managing intense clinical work?",
        }, {
          icon: "ðŸ“…", title: "Unpredictable Schedule", text: "Struggling to follow a fixed schedule due to unpredictable duties, leaving massive backlogs before exam leave?",
        }, {
          icon: "â“", title: "Lack of Guidance", text: "Unsure if youâ€™re focusing on the right topics or how to track your progress against the entire syllabus?",
        }].map((p, idx) => (
          <div key={idx} className="rounded-xl border bg-white p-6 shadow-sm">
            <div className="text-3xl">{p.icon}</div>
            <div className="mt-3 text-lg font-semibold text-gray-900">{p.title}</div>
            <p className="mt-1 text-gray-600 text-sm">{p.text}</p>
          </div>
        ))}
      </div>
    </div>
  </section>
);

const Features = () => (
  <section id="features" className="bg-gray-50">
    <div className="container mx-auto px-4 sm:px-6 py-14">
      <h2 className="text-2xl md:text-3xl font-extrabold text-gray-900 text-center">Your Complete Toolkit for DNB Theory Success</h2>
      <div className="mt-10 grid lg:grid-cols-3 gap-6">
        {[{
          tag: "The Smart Plan Setup Wizard",
          benefit: "Map Your Entire DNB Syllabus in Minutes.",
          desc: "Our wizard is designed for the DNB exam structure. Input your final exam date, and weâ€™ll generate a complete, dayâ€‘byâ€‘day schedule to ensure every topic is covered systematically.",
        }, {
          tag: "The Weekly Planner Board",
          benefit: "Stay on Track, Week After Week.",
          desc: "Manage the reality of residency. Drag and drop topics, adjust for heavy onâ€‘call days, and ensure youâ€™re consistently making progress towards your DNB goal.",
        }, {
          tag: "Master Queue & Gantt Timeline",
          benefit: "Visualize Your Path to Passing the DNB.",
          desc: "Get a birdâ€™sâ€‘eye view of your entire preparation timeline. The Gantt view clearly shows what youâ€™ve covered and whatâ€™s left, eliminating guesswork and anxiety.",
        }].map((f, idx) => (
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
          <h3 className="text-2xl md:text-3xl font-extrabold text-gray-900">Master Highâ€‘Yield DNB Topics with Your AI Tutor.</h3>
          <p className="mt-3 text-gray-700">Our AI tutor, powered by Googleâ€™s Gemini AI, helps you build deep conceptual clarityâ€”critical for the DNBâ€™s applicationâ€‘based questions. Go from passive reading to active, engaged learning.</p>
          <div className="mt-5">
            <a href="/login" className="inline-flex items-center rounded-lg bg-blue-600 text-white px-4 py-2 text-sm font-semibold shadow hover:bg-blue-700">Try the AI Tutor</a>
          </div>
        </div>
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <div className="aspect-[16/9] rounded-lg bg-gray-100 border flex items-center justify-center text-gray-500">
            AI Tutor demo placeholder
          </div>
        </div>
      </div>
    </div>
  </section>
);

const Roadmap = () => (
  <section id="roadmap" className="bg-gray-50">
    <div className="container mx-auto px-4 sm:px-6 py-14">
      <h3 className="text-2xl md:text-3xl font-extrabold text-gray-900 text-center">Starting with DNB, Expanding for All.</h3>
      <ol className="mt-8 space-y-6">
        {[{
          label: "Now",
          text: "DNB Radiology Theory: Our platform is currently optimized to help you ace the DNB theory exam.",
        }, {
          label: "Next",
          text: "MD Theory Exams: We are actively developing modules and plan templates for MD exams, starting with MUHS and expanding to other major universities.",
        }, {
          label: "Future",
          text: "More Specialties & Exams: Our vision is to bring smart planning and AI learning to every postgraduate medical student in India.",
        }].map((i, idx) => (
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
      <div className="rounded-lg bg-blue-50 border border-blue-100 p-3 text-sm text-blue-800 text-center font-medium">Try Our Premium AI Tutor â€” Free for 7 Days! All new accounts get a oneâ€‘week trial to experience AIâ€‘powered learning.</div>
      <h3 className="mt-6 text-2xl md:text-3xl font-extrabold text-gray-900 text-center">A Plan for Every DNB Aspirant.</h3>
      <div className="mt-8 grid md:grid-cols-2 gap-6">
        <div className="rounded-2xl border bg-white p-6 shadow-sm">
          <div className="text-xs uppercase tracking-wide text-blue-700 font-semibold">Rad Mentor (Free Planner)</div>
          <div className="mt-2 text-3xl font-extrabold text-gray-900">â‚¹0 <span className="text-base font-medium text-gray-500">/ forever</span></div>
          <p className="mt-2 text-gray-700">The ultimate planning tool for your DNB exam, completely free.</p>
          <ul className="mt-4 space-y-2 text-sm text-gray-700 list-disc list-inside">
            <li>Personalized plan setup wizard</li>
            <li>Weekly planner board & day caps</li>
            <li>Master queue & timeline</li>
          </ul>
          <a href="/login" className="mt-6 inline-flex items-center rounded-lg bg-blue-600 text-white px-4 py-2 text-sm font-semibold shadow hover:bg-blue-700">Build Your DNB Plan Free</a>
        </div>
        <div className="rounded-2xl border-2 border-blue-600 bg-white p-6 shadow">
          <div className="text-xs uppercase tracking-wide text-blue-700 font-semibold">Rad Mentor Premium (Planner + AI Tutor)</div>
          <div className="mt-2 text-3xl font-extrabold text-gray-900">â‚¹299<span className="text-base font-medium text-gray-500">/month</span> <span className="text-sm text-gray-400">or â‚¹2,999/year</span></div>
          <p className="mt-2 text-gray-700">The complete toolkit to ace your DNB theory exam.</p>
          <div className="mt-3 text-sm text-gray-700">âœ… Everything in the Free Plan, PLUS:</div>
          <ul className="mt-2 space-y-2 text-sm text-gray-700 list-disc list-inside">
            <li>ðŸš€ Unlimited access to the AI Socratic Tutor</li>
            <li>ðŸŽ¯ Plan for multiple goals</li>
            <li>ðŸ“Š Advanced DNBâ€‘focused analytics</li>
          </ul>
          <a href="/login" className="mt-6 inline-flex items-center rounded-lg bg-blue-600 text-white px-4 py-2 text-sm font-semibold shadow hover:bg-blue-700">Start Your 7â€‘Day Free Trial</a>
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
        {[{
          q: "Who is this for? Is it only for the DNB exam?",
          a: "Our initial launch is laserâ€‘focused on the DNB Radiology Theory Exam. We are already working on MD (MUHS) and other university exams next. Check our roadmap!",
        }, {
          q: "Does this cover practicals or viva?",
          a: "Currently, Rad Mentor is designed to help you master the vast syllabus for your theory exam. While a strong theoretical foundation is crucial for practicals, we donâ€™t have specific features for case presentations or viva preparation at this time.",
        }, {
          q: "Can I use this if I am an MD student?",
          a: "Absolutely! While our current messaging is DNBâ€‘focused, the planning tools are flexible and can be used by anyone. You can set up a custom plan for your universityâ€™s syllabus. Official MD exam templates are coming soon!",
        }].map((item, idx) => (
          <details key={idx} className="group rounded-lg border bg-white p-4 open:shadow-sm">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2">
              <span className="font-medium text-gray-900">{item.q}</span>
              <span className="text-gray-500 group-open:rotate-180 transition">âŒ„</span>
            </summary>
            <p className="mt-2 text-sm text-gray-700">{item.a}</p>
          </details>
        ))}
      </div>
    </div>
  </section>
);

const FinalCTA = () => (
  <section className="bg-gradient-to-r from-blue-600 to-indigo-600">
    <div className="container mx-auto px-4 sm:px-6 py-14 text-center">
      <h3 className="text-3xl font-extrabold text-white">Walk into Your DNB Exam with Confidence.</h3>
      <p className="mt-2 text-blue-100">Build a structured study plan, keep your progress synced, and learn with AIâ€‘powered tutoring designed for DNB radiology residents.</p>
      <a href="/login" className="mt-6 inline-flex items-center rounded-lg bg-white text-blue-700 px-6 py-3 text-sm font-semibold shadow hover:bg-blue-50">Start Your Free DNB Plan Today</a>
    </div>
  </section>
);

export default function LandingPage() {
  return (
    <div className="font-inter">
      <NavBar />
      <Hero />
      <CredBar />
      <section id="how-it-works" className="bg-white">
  <div className="container mx-auto px-4 sm:px-6 py-14">
    <h2 className="text-2xl md:text-3xl font-extrabold text-gray-900 text-center">How It Works</h2>
    <div className="mt-8 grid gap-6 items-center grid-cols-1 md:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr]">
      <div className="rounded-xl border bg-white p-6 text-center shadow-sm">
        <div className="text-3xl">📝</div>
        <div className="mt-2 font-semibold text-gray-900">Create Your Plan</div>
        <p className="mt-1 text-sm text-gray-600">Answer a few questions — dates, pacing, and focus areas.</p>
      </div>
      <div className="flex items-center justify-center">
        <span className="hidden md:inline text-2xl text-gray-400">→</span>
        <span className="md:hidden text-2xl text-gray-400">↓</span>
      </div>
      <div className="rounded-xl border bg-white p-6 text-center shadow-sm">
        <div className="text-3xl">📆</div>
        <div className="mt-2 font-semibold text-gray-900">Execute Weekly</div>
        <p className="mt-1 text-sm text-gray-600">Use the Weekly Planner to stay on track and adapt.</p>
      </div>
      <div className="flex items-center justify-center">
        <span className="hidden md:inline text-2xl text-gray-400">→</span>
        <span className="md:hidden text-2xl text-gray-400">↓</span>
      </div>
      <div className="rounded-xl border bg-white p-6 text-center shadow-sm">
        <div className="text-3xl">🤖</div>
        <div className="mt-2 font-semibold text-gray-900">Learn with AI</div>
        <p className="mt-1 text-sm text-gray-600">Master high‑yield topics via our Socratic tutor.</p>
      </div>
      <div className="flex items-center justify-center">
        <span className="hidden md:inline text-2xl text-gray-400">→</span>
        <span className="md:hidden text-2xl text-gray-400">↓</span>
      </div>
      <div className="rounded-xl border bg-white p-6 text-center shadow-sm">
        <div className="text-3xl">🏆</div>
        <div className="mt-2 font-semibold text-gray-900">Track & Succeed</div>
        <p className="mt-1 text-sm text-gray-600">See progress and finish strong before exam leave.</p>
      </div>
    </div>
  </div>
</section>
      <Problems />
      <Features />
      <TutorSpotlight />
      <Roadmap />
      <Pricing />
      <FAQ />
      <FinalCTA />
      <footer className="border-t bg-white">
        <div className="container mx-auto px-4 sm:px-6 py-6 text-xs text-gray-500 flex items-center justify-between">
          <span>Â© {new Date().getFullYear()} Rad Mentor</span>
          <a className="hover:text-blue-700" href="/login">Login</a>
        </div>
      </footer>
    </div>
  );
}



