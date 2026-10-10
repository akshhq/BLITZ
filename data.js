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
 * NOTE: All placeholder data is marked with "// TODO:" comments below. Replace with
 * verified societal information before production publishing.
 * =============================================================================
 */

window.BLITZ_DATA = (function () {
// Used verbatim for display and for the Maps link. Do not reword or prefix.
var ADDRESS = 'H-4, 5 Zone, near Sainik Vihar, Co-operative Group Housing Societies Pitampura, Pitampura, Delhi, 110034';

return {
  // TODO: Replace sample announcements with real department notices
  announcements: [
    {
      id: 'announcement-01',
      title: 'Call for Core Working Committee Nominations 2026–27',
      date: '2026-10-15',
      summary: 'Applications are open for second and third-year CS students for lead positions.',
      body: 'BLITZ invites energetic students passionate about technology, event management, design, and competitive programming to apply for the Executive Committee. Shortlisted candidates will be invited for an interview round.',
      link: 'https://example.com/TODO-nominations-form' // TODO: Replace with real Google Form URL
    },
    {
      id: 'announcement-02',
      title: 'Annual Flagship Hackathon "CodeVerse 2026" Dates Released',
      date: '2026-10-05',
      summary: '48-hour hybrid build sprint scheduled for late November at Keshav Mahavidyalaya.',
      body: 'Get your teams ready! CodeVerse returns with new tracks in Distributed Systems, Artificial Intelligence, and Web3 Open Innovation. Cash prizes, mentorship, and swags await participants.',
      link: 'https://example.com/TODO-codeverse-info' // TODO: Replace with event portal link
    },
    {
      id: 'announcement-03',
      title: 'Workshop: Modern Linux & Git for Systems Engineering',
      date: '2026-09-28',
      summary: 'Hands-on laboratory session for first and second year undergraduates.',
      body: 'Learn shell scripting, version control workflows, SSH tunneling, and open-source contribution patterns. Bring your laptops with Linux or WSL configured.',
      link: ''
    }
  ],

  // TODO: Replace sample events with the official departmental calendar
  events: [
    {
      id: 'codeverse-2026',
      title: 'CodeVerse 2026',
      date: '2026-11-20',
      location: 'Computer Science Lab & Auditorium',
      description: 'The flagship 48-hour collaborative build sprint challenging inter-college student teams to tackle real-world algorithmic and product problems.',
      additionalInfo: 'Annual Hackathon'
    },
    {
      id: 'systems-workshop-2026',
      title: 'Kernel & Systems Deep Dive',
      date: '2026-10-25',
      location: 'Seminar Hall, Keshav Mahavidyalaya',
      description: 'An intensive technical workshop exploring operating system internals, concurrency primitives, and low-level memory architecture.',
      additionalInfo: 'Hands-on Technical Workshop'
    },
    {
      id: 'blitzkrieg-2026',
      title: 'Blitzkrieg 2026',
      date: '2026-03-15',
      location: 'Keshav Mahavidyalaya Campus',
      description: 'The premier annual departmental festival featuring technical paper presentations, speed coding, bug hunts, and tech debates.',
      additionalInfo: 'Annual Departmental Festival'
    },
    {
      id: 'ai-symposium-2025',
      title: 'Symposium on Modern Machine Intelligence',
      date: '2025-11-10',
      location: 'Main Auditorium',
      description: 'A distinguished speaker session featuring alumni and industry researchers discussing foundational models and deployment infrastructure.',
      additionalInfo: 'Technical Symposium'
    }
  ],

  // Confirmed society members. Cards show photo, name and position only.
  // Photos: 400x400 WebP in assets/images/team/ (see tools/optimize-team-images.py).
  team: [
    // Leadership (display order: President, Secretary, Treasurer)
    { name: 'Aksh Kumar', position: 'President', tier: 'core', photo: 'assets/images/team/aksh-kumar.webp' },
    { name: 'Priyal Vatsa', position: 'Secretary', tier: 'core', photo: 'assets/images/team/priyal-vatsa.webp' },
    { name: 'Vrinda Goyal', position: 'Treasurer', tier: 'core' }, // TODO: add photo

    // Senior Executives
    { name: 'Ayushi Jain', position: 'Senior Executive', tier: 'senior' }, // TODO: add photo
    { name: 'Dev Narayan', position: 'Senior Executive', tier: 'senior', photo: 'assets/images/team/dev-narayan.webp' },
    { name: 'Kavya Gera', position: 'Senior Executive', tier: 'senior', photo: 'assets/images/team/kavya-gera.webp' },
    { name: 'Lavanya Sharma', position: 'Senior Executive', tier: 'senior' }, // TODO: add photo
    { name: 'Parth Arora', position: 'Senior Executive', tier: 'senior', photo: 'assets/images/team/parth-arora.webp' },
    { name: 'Riya Solanki', position: 'Senior Executive', tier: 'senior', photo: 'assets/images/team/riya-solanki.webp' },

    // Junior Executives
    { name: 'Sachi Grover', position: 'Junior Executive', tier: 'junior', photo: 'assets/images/team/sachi-grover.webp' },
    { name: 'Shaurya', position: 'Junior Executive', tier: 'junior', photo: 'assets/images/team/shaurya.webp' },

    // Volunteers
    { name: 'Aditya Raj', position: 'Volunteer', tier: 'volunteer', photo: 'assets/images/team/aditya-raj.webp' },
    { name: 'Diva Bauddh', position: 'Volunteer', tier: 'volunteer', photo: 'assets/images/team/diva-bauddh.webp' }, // TODO: confirm spelling of "Bauddh"
    { name: 'Eesha', position: 'Volunteer', tier: 'volunteer', photo: 'assets/images/team/eesha.webp' },
    { name: 'Neha Bisht', position: 'Volunteer', tier: 'volunteer', photo: 'assets/images/team/neha-bisht.webp' },
    { name: 'Yashika Gupta', position: 'Volunteer', tier: 'volunteer', photo: 'assets/images/team/yashika-gupta.webp' }
  ],

  // TODO: Replace with real photographs in assets/images/gallery/
  gallery: [
    {
      id: 'gallery-01',
      image: 'assets/images/gallery/orientation-2026.svg',
      title: 'Department Induction & Orientation',
      alt: 'Freshers orientation session in the Keshav Mahavidyalaya auditorium',
      date: 'Aug 2026',
      location: 'Auditorium'
    },
    {
      id: 'gallery-02',
      image: 'assets/images/gallery/hackathon-build.svg',
      title: 'CodeVerse 24-Hour Build Sprint',
      alt: 'Students collaborating on code prototypes during the 24-hour hackathon',
      date: 'Nov 2025',
      location: 'Lab 1 & 2'
    },
    {
      id: 'gallery-03',
      image: 'assets/images/gallery/web3-workshop.svg',
      title: 'Systems & Cloud Workshop',
      alt: 'Interactive laboratory tutorial on cloud computing architectures',
      date: 'Feb 2026',
      location: 'Seminar Hall'
    },
    {
      id: 'gallery-04',
      image: 'assets/images/gallery/annual-symposium.svg',
      title: 'Annual Technical Symposium',
      alt: 'Audience and keynote speakers during technical paper presentations',
      date: 'Mar 2026',
      location: 'Main Stage'
    },
    {
      id: 'gallery-05',
      image: 'assets/images/gallery/tech-quiz-finals.svg',
      title: 'Inter-College Tech Quiz Finals',
      alt: 'Buzzer round of the inter-college computer science quiz championship',
      date: 'Apr 2026',
      location: 'Conference Room'
    }
  ],

  // TODO: Replace sample achievements with verified department accolades
  achievements: [
    {
      id: 'achievement-01',
      title: 'Smart India Hackathon Finalists',
      year: '2026',
      category: 'National Competition',
      description: 'Departmental team secured national finalist ranking for automated public transit scheduling system.',
      metrics: 'Top 5 National Finalist'
    },
    {
      id: 'achievement-02',
      title: 'Best Technical Society Citation',
      year: '2025',
      category: 'Institutional Award',
      description: 'Awarded exemplary society of the year at Keshav Mahavidyalaya for impactful workshops and hackathons.',
      metrics: 'College Trophy'
    },
    {
      id: 'achievement-03',
      title: 'Inter-University Speed Coding Champions',
      year: '2025',
      category: 'Competitive Programming',
      description: 'First prize at Delhi Technological University annual collegiate coding championship.',
      metrics: '1st Place & Gold Citation'
    },
    {
      id: 'achievement-04',
      title: 'Open Source Community Grant',
      year: '2024',
      category: 'Open Source',
      description: 'Student project selected for community sponsorship supporting local student tooling and infrastructure.',
      metrics: 'Funded Project'
    },
    {
      id: 'achievement-05',
      title: 'Academic Research Publication',
      year: '2024',
      category: 'Research Milestone',
      description: 'Undergraduate student paper accepted at IEEE International Conference on Information Systems.',
      metrics: 'IEEE Xplore Indexed'
    }
  ],

  // TODO: Replace sample collaborations with real partner societies and sponsors
  collaborations: [
    {
      name: 'DU Computer Science Council',
      logo: 'assets/images/collaborations/partner-du.svg',
      url: 'https://example.com/TODO-du-cs-council',
      type: 'Academic Affiliate',
      since: '2023'
    },
    {
      name: 'Open Source Student Alliance',
      logo: 'assets/images/collaborations/partner-foss.svg',
      url: 'https://example.com/TODO-foss-alliance',
      type: 'Community Partner',
      since: '2024'
    },
    {
      name: 'Delhi Student Dev Guild',
      logo: 'assets/images/collaborations/partner-dev.svg',
      url: 'https://example.com/TODO-dev-guild',
      type: 'Technical Chapter',
      since: '2024'
    },
    {
      name: 'Hack Club DU Network',
      logo: 'assets/images/collaborations/partner-hack.svg',
      url: 'https://example.com/TODO-hack-club',
      type: 'Hackathon Partner',
      since: '2025'
    }
  ],

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
