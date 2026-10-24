export const SITE = {
  url: 'https://blogs.breatheoss.app',
  title: 'Breathe Blog',
  name: 'BreatheOSS',
  tagline:
    'Blogs from the team building an open air quality network for Jammu & Kashmir and Ladakh.',
  description:
    'The BreatheOSS blog: sensors, AQI maths and app development from the team building Breathe, an open-source air quality network for Jammu & Kashmir and Ladakh.',
  repo: 'https://github.com/breathe-OSS/blogs',
  pageSize: 8,
  wordsPerMinute: 200,
};

export const LINKS = {
  app: 'https://breatheoss.app',
  about: 'https://about.breatheoss.app',
  github: 'https://github.com/breathe-OSS',
  discord: 'https://discord.breatheoss.app',
  instagram: 'https://www.instagram.com/breatheoss/',
  email: 'mailto:contact@breatheoss.app',
};

export interface Heading {
  id: string;
  depth: number;
  text: string;
}

export interface Post {
  slug: string;
  file: string;
  title: string;
  description: string;
  published: Date;
  updated?: Date;
  category: string;
  tags: string[];
  author: string;
  cover?: string;
  coverCaption?: string;
  draft: boolean;
  html: string;
  feedHtml: string;
  headings: Heading[];
  words: number;
  minutes: number;
}
