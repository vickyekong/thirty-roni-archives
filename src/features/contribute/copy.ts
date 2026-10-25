import type {
  CategoryQuestionKey,
  ContributorCategory,
  LifeStage,
  MessageVisibility,
  NameVisibility,
  StepKey,
} from '@shared/contribution'

export const STEP_COPY: Record<StepKey, { label: string; eyebrow: string; title: string; intro: string }> = {
  introduction: {
    label: 'Introduction',
    eyebrow: 'Step one',
    title: 'First, a little about you',
    intro: 'So Roni knows whose words she is reading.',
  },
  memories: {
    label: 'Memories',
    eyebrow: 'Step two',
    title: 'Personal memories',
    intro: 'Answer as many or as few as you like. A single sentence can be just as precious as a page.',
  },
  celebrating: {
    label: 'Celebrating her',
    eyebrow: 'Step three',
    title: 'Celebrating her',
    intro: 'The things that make Roni, Roni.',
  },
  message: {
    label: 'Birthday message',
    eyebrow: 'Step four',
    title: 'A birthday message',
    intro: 'What you would say to her if you had her full attention for a moment.',
  },
  media: {
    label: 'Photographs & more',
    eyebrow: 'Step five',
    title: 'Photographs, film, voice and letters',
    intro: 'Everything here is optional. Uploads are kept private and only the curator can see them.',
  },
  timeline: {
    label: 'Timeline',
    eyebrow: 'Step six',
    title: 'Placing it in her story',
    intro: 'This helps us place your memory in the right chapter of her life.',
  },
  consent: {
    label: 'Consent',
    eyebrow: 'Step seven',
    title: 'Sharing, with care',
    intro: 'You decide how your name and words appear.',
  },
  review: {
    label: 'Review',
    eyebrow: 'Step eight',
    title: 'Review and submit',
    intro: 'Take a last look. Once submitted, your contribution goes to the curator for review.',
  },
}

export const MEMORY_QUESTIONS = {
  earliest: 'What is your earliest memory of Roni?',
  favourite: 'What is your favourite memory with her?',
  unknownFact: 'What’s something about Roni that people might not know?',
  funniest: 'What’s the funniest thing you’ve experienced together?',
} as const

export const CATEGORY_INTRO: Record<ContributorCategory, string> = {
  parent: 'A few questions just for her parents',
  sibling: 'A few questions just for her siblings',
  friend: 'A few questions just for her friends',
}

export const CATEGORY_QUESTIONS: Record<CategoryQuestionKey, string> = {
  birthDay: 'What do you remember about the day she was born?',
  childhoodPersonality: 'What was her personality like as a child?',
  childhoodMemories: 'What are your favourite memories from her childhood?',
  milestones: 'Which milestones in her life stand out to you?',
  lessons: 'What did raising her teach you?',
  hopes: 'What are your hopes for her future?',
  adventures: 'What were your favourite childhood adventures together?',
  traditions: 'Which family traditions do you share?',
  funnyMemories: 'What are your funniest memories together?',
  insideJokes: 'Is there an inside joke she will recognise instantly?',
  admireToday: 'What do you admire about her today?',
  howWeMet: 'How did you meet?',
  firstImpressions: 'What was your first impression of her?',
  sharedExperiences: 'What are your favourite experiences together?',
  friendshipMoments: 'Which moments shaped your friendship?',
  nextDecadeHopes: 'What do you hope her next decade holds?',
}

export const LIFE_STAGE_LABELS: Record<LifeStage, string> = {
  early_childhood: 'Early childhood',
  childhood: 'Childhood',
  teens: 'Teenage years',
  twenties: 'Her twenties',
  recent: 'Recently',
}

export const NAME_VISIBILITY_COPY: Record<NameVisibility, { label: string; description: string }> = {
  full_name: { label: 'Show my full name', description: 'Your name appears as you entered it.' },
  first_name: { label: 'First name only', description: 'Only your first name is shown.' },
  anonymous: { label: 'Keep me anonymous', description: 'Your words appear without a name. The curator still knows who you are.' },
}

export const MESSAGE_VISIBILITY_COPY: Record<MessageVisibility, { label: string; description: string }> = {
  everyone: {
    label: 'Roni and invited family',
    description: 'Once approved, it may appear in the private birthday experience.',
  },
  roni_only: {
    label: 'Only Roni',
    description: 'Kept out of anything family members can see. Only Roni and the curator.',
  },
  curator_only: {
    label: 'Only the curator',
    description: 'Background for the archive. It will not be shown to anyone else.',
  },
}
