import { buildTemplateBlogEngineRuntime } from '../../src/index.js';
const site = {
    id: 'generic-service-business',
    brand: 'Summit Service Co.',
    legalName: 'Summit Service Company',
    domain: 'https://example-service-site.com',
    description: 'A Business Runner-powered service website template.',
    industry: 'Professional services',
    primaryMarket: 'San Diego',
    region: 'CA',
    schemaType: 'ProfessionalService',
    theme: {
        ink: '#f4f4f0',
        muted: '#a8b3b7',
        paper: '#05060a',
        surface: '#0b1015',
        primary: '#22d3ee',
        accent: '#facc15',
    },
    hero: { image: '/assets/hero-professional.svg' },
    services: [
        { slug: 'consultation', title: 'Consultation', summary: 'First-contact qualification and routing.' },
    ],
    markets: ['San Diego', 'La Jolla'],
    collections: [
        { title: 'Legal', image: '/assets/collection-legal.svg', imageAlt: 'Law office desk' },
    ],
    blogPosts: [],
    businessRunner: {
        agentName: 'BRI',
        poweredByUrl: 'https://bizrnr.com/?utm_source=template-website',
    },
};
export function templateBlogRuntime() {
    return buildTemplateBlogEngineRuntime(site);
}
//# sourceMappingURL=runtime.js.map