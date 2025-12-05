import { useMemo } from "react";
import { Github, Linkedin, Twitter } from "lucide-react";

interface TeamMember {
  name: string;
  image: string;
  roles: string[];
  links: {
    github?: string;
    linkedin?: string;
    twitter?: string;
  };
}

const teamMembers: TeamMember[] = [
  {
    name: "Valentin",
    image: "/profiles/Valentin.jpg",
    roles: ["Student @ 42", "Frontend Developer Intern @ Rakuten"],
    links: {
      github: "https://github.com/ValentinMalassigne/",
      linkedin: "https://linkedin.com/in/valentin-malassigne/",
      twitter: "https://x.com/MValentin42",
    },
  },
  {
    name: "JeanBaptiste",
    image: "/profiles/JeanBaptiste.png",
    roles: ["Student @ 42", "Cobol Developer Apprentice @ AXA"],
    links: {
      github: "https://github.com/JeanBaptisteDurand",
      linkedin: "https://www.linkedin.com/in/jean-baptiste-durand-972817285/",
      twitter: "https://x.com/Beorlor",
    },
  },
  {
    name: "Benjamin",
    image: "/profiles/Benjamin.jpg",
    roles: ["Student @ 42"],
    links: {
      github: "https://github.com/BenjDW",
      linkedin: "https://www.linkedin.com/in/benjamin-d-77764934b/",
    },
  },
];

// Fisher-Yates shuffle algorithm
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export default function Team() {
  // Shuffle team members on each page load
  const shuffledMembers = useMemo(() => shuffleArray(teamMembers), []);

  return (
    <div className="container mx-auto px-4 py-12">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-display font-bold mb-2">
          Meet the Team
        </h1>
        <p className="text-surface-400 mb-8">
          The minds behind BaseLens
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {shuffledMembers.map((member) => (
            <div
              key={member.name}
              className="card p-6 flex flex-col items-center text-center hover:border-primary-500/50 transition-colors"
            >
              <div className="w-32 h-32 rounded-full overflow-hidden mb-4 border-2 border-surface-700">
                <img
                  src={member.image}
                  alt={member.name}
                  className="w-full h-full object-cover"
                />
              </div>
              
              <h2 className="text-xl font-semibold mb-2">{member.name}</h2>
              
              <div className="space-y-1 mb-4">
                {member.roles.map((role, index) => (
                  <p key={index} className="text-surface-400 text-sm">
                    {role}
                  </p>
                ))}
              </div>
              
              <div className="flex gap-4 mt-auto">
                {member.links.github && (
                  <a
                    href={member.links.github}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-surface-400 hover:text-primary-400 transition-colors"
                    aria-label={`${member.name}'s GitHub`}
                  >
                    <Github className="w-5 h-5" />
                  </a>
                )}
                {member.links.linkedin && (
                  <a
                    href={member.links.linkedin}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-surface-400 hover:text-primary-400 transition-colors"
                    aria-label={`${member.name}'s LinkedIn`}
                  >
                    <Linkedin className="w-5 h-5" />
                  </a>
                )}
                {member.links.twitter && (
                  <a
                    href={member.links.twitter}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-surface-400 hover:text-primary-400 transition-colors"
                    aria-label={`${member.name}'s X/Twitter`}
                  >
                    <Twitter className="w-5 h-5" />
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}