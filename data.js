/**
 * BLITZ Society Data Store
 * =============================================================================
 * Central content configuration for BLITZ (Computer Science Society,
 * Keshav Mahavidyalaya, University of Delhi).
 *
 * HOW TO ADD / EDIT CONTENT:
 * 1. Announcements: Add objects to `announcements` with id, title, ISO date (YYYY-MM-DD),
 *    summary, full body text, and optional URL.
 * 2. Events: Add objects to `events` with id, title, ISO date (YYYY-MM-DD), location,
 *    description, and category/type. The website automatically tags upcoming vs past.
 * 3. Team: Add members to `team` with name, position, tier ('core' | 'senior' | 'junior' | 'volunteer').
 *    Optional field: photo (relative path, e.g. 'assets/images/team/first-last.webp').
 *    Members without a photo get the decorative avatar placeholder automatically.
 *    Cards show photo, name and position only.
 * 4. Gallery: Add items to `gallery` with image path, title, and descriptive alt text.
 *    Place real photos inside assets/images/gallery/ and update paths here.
 * 5. Achievements: Add accomplishments (wins, awards, milestones) to `achievements`.
 * 6. Collaborations: Add partner societies, sponsors, and communities to `collaborations`.
 * 7. Contact: Update official links, email, handle and address in `contact`.
 *    The footer, the Maps link and the <noscript> block are all derived from it
 *    (after editing run `node tools/sync-noscript.js`; JSON-LD in index.html is static).
 *
 * All content should be verified before publication. Keep the front-end data source
 * centralised and consistent with the live society information.
 * =============================================================================
 */

window.BLITZ_DATA = (function () {
// Used verbatim for display and for the Maps link. Do not reword or prefix.
var ADDRESS = 'H-4, 5 Zone, near Sainik Vihar, Co-operative Group Housing Societies Pitampura, Pitampura, Delhi, 110034';

return {
  announcements: [
    {
      id: 'internal-sih-results-out',
      title: 'INTERNAL SIH RESULTS OUT !!',
      date: '2026-10-10',
      summary: 'The internal SIH results have been announced. Please refer to the official notice for the confirmed list.',
      body: '',
      link: 'https://drive.google.com/file/d/1T6O1p8VMs4UZNCT3o1bfY7rn_g5OriPZ/view?usp=sharing'
    }
  ],

  events: [
    {
      id: 'dissertation-project-work-2025',
      title: 'Dissertation and Academic Project Work',
      date: '2025-09-24',
      time: '12:30 PM',
      location: 'Keshav Mahavidyalaya, Computer Science Department',
      description: 'Seminar and orientation session covering research problems, literature review, research design, methodology, lab assessment guidelines, and academic integrity.',
      category: 'Seminar / Orientation',
      layout: 'workshop',
      format: 'Seminar / Orientation',
      speakers: ['Prof. Preeti Sehgal', 'Dr. Ashutosh Singh', 'Prof. Vinita Jindal'],
      keyPoints: [
        'Research problems and literature review',
        'Research design and methodology',
        'Assessment guidelines and academic integrity'
      ],
      additionalInfo: 'Speakers: Prof. Preeti Sehgal, Dr. Ashutosh Singh and Prof. Vinita Jindal. Time: 12:30 PM.'
    },
    {
      id: 'uiux-design-workshop-2025',
      title: 'UI/UX Design Workshop',
      date: '2025-11-01',
      time: '11:00 AM',
      location: 'Online',
      description: 'An online workshop focused on design thinking, problem identification, the Double Diamond process, wireframing, and prototyping.',
      category: 'Workshop',
      layout: 'workshop',
      format: 'Online',
      speakers: ['Anjali'],
      keyPoints: [
        'Design thinking and problem identification',
        'Double Diamond process',
        'Wireframing and prototyping'
      ],
      additionalInfo: 'Host/speaker: Anjali (designation to be confirmed). Time: 11:00 AM.'
    },
    {
      id: 'code-verse-2026',
      title: 'Code Verse — Coding Competition',
      date: '2026-01-16',
      time: '11:00 AM–12:30 PM',
      location: 'Lab 1',
      description: 'Six coding questions across easy, medium, and hard categories on HackerRank, with nine teams participating.',
      category: 'Coding Competition',
      layout: 'competition',
      format: 'Hackerrank Competition',
      platform: 'HackerRank',
      participants: 'Nine teams',
      winners: [
        { position: 'First', names: ['Vishal', 'Daksh Sahni'] },
        { position: 'Second', names: ['Mayank Kansal', 'Aniket Jaiswal'] },
        { position: 'Third', names: ['Tarun Jaiswal', 'Krish Kumar Jaiswal'] }
      ],
      keyPoints: [
        'Six coding questions',
        'Easy, medium and hard categories',
        'Nine teams participated'
      ],
      additionalInfo: 'Winners: 1st Vishal and Daksh Sahni; 2nd Mayank Kansal and Aniket Jaiswal; 3rd Tarun Jaiswal and Krish Kumar Jaiswal. Time: 11:00 AM–12:30 PM.'
    },
    {
      id: 'technyx-2026',
      title: 'TECHNYX 2026',
      date: '2026-01-27',
      location: 'Keshav Mahavidyalaya',
      description: 'A parent technical event combining multiple student-facing sessions on internships, Git and GitHub, web fundamentals, and NLP.',
      category: 'Technical Event',
      layout: 'festival',
      format: 'Parent Event',
      sessions: [
        { id: 'internships-what-companies-expect', title: 'Internships — What Companies Expect', date: '2026-01-27', speakers: ['Soumya Ranjan', 'Riya Arora'], summary: 'Session on internship expectations, technical and soft skills, communication, work ethics and professionalism.' },
        { id: 'git-github-bootcamp', title: 'Git and GitHub — Bootcamp', date: '2026-01-29', speakers: ['Natya Vidhan Biswas', 'Parth Arora'], summary: 'Session on version control, repositories, commits and collaboration workflows.' },
        { id: 'from-url-to-webpage', title: 'From URL to Webpage — Understanding the Web', date: '2026-02-01', speakers: ['Aksh Kumar', 'Ayushi Jain'], summary: 'Session on URLs, DNS, servers, HTTP/HTTPS, web development, APIs and databases.' },
        { id: 'natural-language-processing', title: 'Natural Language Processing', date: '2026-02-02', speakers: ['Vrinda Goyal', 'Priyal Vatsa'], summary: 'Session on AI, NLP fundamentals, tokenization, stop-word removal, stemming, lemmatization and text mining.' }
      ],
      additionalInfo: 'Sessions included: Internships — What Companies Expect (27 Jan); Git and GitHub Bootcamp (29 Jan); From URL to Webpage — Understanding the Web (1 Feb); Natural Language Processing (2 Feb).'
    },
    {
      id: 'agentic-ai-speaker-session-2026',
      title: 'Agentic AI Speaker Session',
      date: '2026-02-05',
      time: 'Date conflict: 5 Feb (summary table) / 6 Feb (detailed report)',
      location: 'Keshav Mahavidyalaya',
      description: 'Speaker session on AI agents, multi-agent systems, API-based agents, applications, limitations, and responsible implementation.',
      category: 'Speaker Session',
      layout: 'speaker',
      format: 'Speaker Session',
      speakers: ['Dr. Manish Gupta'],
      keyPoints: [
        'AI agents and multi-agent systems',
        'Practical demonstrations',
        'API-based agents, applications and limitations',
        'Responsible implementation'
      ],
      additionalInfo: 'Speaker: Dr. Manish Gupta. Date conflict: annual summary table lists 5 February 2026 while detailed report references 6 February 2026; confirmation pending.'
    },
    {
      id: 'blitzkrieg-2026',
      title: 'BLITZKRIEG 2026',
      date: '2026-03-12',
      location: 'Keshav Mahavidyalaya Campus',
      description: 'The annual technical fest featuring a speaker session on cloud computing, SaaS, PaaS, IaaS, and career opportunities, alongside student competitions and interactive events.',
      category: 'Annual Technical Fest',
      layout: 'festival',
      format: 'Annual Technical Fest',
      speaker: 'Prof. Rahul Johari',
      competitionSections: [
        { title: 'Eleven’s Logic Lab', type: 'Quiz' },
        { title: 'Between the 2 Worlds', type: 'Debate' },
        { title: 'Upside Showdown', type: 'BGMI Tournament' },
        { title: 'Hawkings Hack', type: 'Hackathon' },
        { title: 'Escape the Upside Down', type: 'Treasure Hunt' }
      ],
      additionalInfo: 'Featured sub-events: Eleven’s Logic Lab — Quiz; Between the 2 Worlds — Debate; Upside Showdown — BGMI Tournament; Hawkings Hack — Hackathon; Escape the Upside Down — Treasure Hunt.'
    }
  ],

  // Confirmed society members. Cards show photo, name and position only.
  // Photos: 400x400 WebP in assets/images/team/ (see tools/optimize-team-images.py).
  team: [
    { name: 'Aksh Kumar', position: 'President', tier: 'core', photo: 'assets/images/team/aksh-kumar.webp' },
    { name: 'Priyal Vatsa', position: 'Secretary', tier: 'core', photo: 'assets/images/team/priyal-vatsa.webp' },
    { name: 'Vrinda Goyal', position: 'Treasurer', tier: 'core' },

    { name: 'Ayushi Jain', position: 'Senior Executive', tier: 'senior' },
    { name: 'Dev Narayan', position: 'Senior Executive', tier: 'senior', photo: 'assets/images/team/dev-narayan.webp' },
    { name: 'Kavya Gera', position: 'Senior Executive', tier: 'senior', photo: 'assets/images/team/kavya-gera.webp' },
    { name: 'Lavanya Sharma', position: 'Senior Executive', tier: 'senior' },
    { name: 'Parth Arora', position: 'Senior Executive', tier: 'senior', photo: 'assets/images/team/parth-arora.webp' },
    { name: 'Riya Solanki', position: 'Senior Executive', tier: 'senior', photo: 'assets/images/team/riya-solanki.webp' },

    { name: 'Sachi Grover', position: 'Junior Executive', tier: 'junior', photo: 'assets/images/team/sachi-grover.webp' },
    { name: 'Shaurya', position: 'Junior Executive', tier: 'junior', photo: 'assets/images/team/shaurya.webp' },

    { name: 'Aditya Raj', position: 'Volunteer', tier: 'volunteer', photo: 'assets/images/team/aditya-raj.webp' },
    { name: 'Diva Bauddh', position: 'Volunteer', tier: 'volunteer', photo: 'assets/images/team/diva-bauddh.webp' },
    { name: 'Eesha', position: 'Volunteer', tier: 'volunteer', photo: 'assets/images/team/eesha.webp' },
    { name: 'Neha Bisht', position: 'Volunteer', tier: 'volunteer', photo: 'assets/images/team/neha-bisht.webp' },
    { name: 'Yashika Gupta', position: 'Volunteer', tier: 'volunteer', photo: 'assets/images/team/yashika-gupta.webp' }
  ],

  gallery: [
    {
      id: 'gallery-01',
      image: 'assets/images/gallery/orientation-2026.svg',
      title: 'Department Induction & Orientation',
      description: 'A welcoming orientation for the new student cohort and society introduction.',
      alt: 'Freshers orientation session in the Keshav Mahavidyalaya auditorium',
      date: 'Aug 2026',
      location: 'Auditorium'
    },
    {
      id: 'gallery-02',
      image: 'assets/images/gallery/hackathon-build.svg',
      title: 'Code Verse — Coding Competition',
      description: 'Students tackled coding challenges and collaborated under time pressure.',
      alt: 'Students collaborating on code prototypes during the coding competition',
      date: 'Jan 2026',
      location: 'Lab 1'
    },
    {
      id: 'gallery-03',
      image: 'assets/images/gallery/web3-workshop.svg',
      title: 'UI/UX Design Workshop',
      description: 'A design thinking workshop covering wireframes, prototypes and problem framing.',
      alt: 'Online design workshop with brainstorming and wireframing exercises',
      date: 'Nov 2025',
      location: 'Online'
    },
    {
      id: 'gallery-04',
      image: 'assets/images/gallery/annual-symposium.svg',
      title: 'Dissertation and Academic Project Work',
      description: 'Academic discussions focused on methodology, integrity and research readiness.',
      alt: 'Academic seminar on research design and project work',
      date: 'Sep 2025',
      location: 'Department Seminar'
    },
    {
      id: 'gallery-05',
      image: 'assets/images/gallery/tech-quiz-finals.svg',
      title: 'TECHNYX 2026',
      description: 'A series of technical sessions covering web fundamentals, Git workflows and NLP.',
      alt: 'Technical sessions covering web fundamentals, GitHub workflows and NLP',
      date: 'Jan 2026',
      location: 'Keshav Mahavidyalaya'
    }
  ],

  achievements: [],

  collaborations: [],

  // Official, confirmed contact details.
  contact: {
    mail: 'team.blitzkmv@gmail.com',
    instagram: 'https://www.instagram.com/blitzkmv/',
    instagramHandle: '@blitzkmv',
    linkedin: 'https://www.linkedin.com/in/blitz-keshav-mahavidyalaya',
    location: ADDRESS,
    mapsUrl: 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(ADDRESS),
    department: 'Department of Computer Science',
    college: 'Keshav Mahavidyalaya, University of Delhi'
  }
};
})();
