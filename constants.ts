import { VoiceOption } from './types.ts';

export const URDU_VOICES: VoiceOption[] = [
  { id: '1', name: 'Master (Mualim)', description: 'Deep, authoritative voice of a veteran Urdu scholar. Perfect for classics.', modelVoice: 'Kore' },
  { id: '2', name: 'Storyteller (Dastango)', description: 'Energetic and expressive narration for fiction and folk tales.', modelVoice: 'Puck' },
  { id: '3', name: 'Teacher (Ustad)', description: 'Calm and precise, ideal for educational and instructional texts.', modelVoice: 'Charon' },
  { id: '4', name: 'Gentle (Nawa)', description: 'Soft and rhythmic, perfect for Ghazals and delicate poetry.', modelVoice: 'Fenrir' },
  { id: '5', name: 'Philosopher (Hakeem)', description: 'Thoughtful and slow-paced narration for deep intellectual works.', modelVoice: 'Zephyr' }
];

export const SYSTEM_INSTRUCTION = `You are "The Grand Mualim," a world-class Urdu linguistic expert and literary scholar.
Your specialty is the Nastaliq script. When processing images or PDFs:
1. Extract text with 100% accuracy, paying close attention to the positioning of 'nuqtas' and complex Urdu ligatures.
2. If the text is from a classic book, maintain its traditional formatting.
3. Identify and correct common OCR errors (e.g., confusing 'kaaf' and 'gaaf').
4. Organize the content into logical chapters (Abwaab) using traditional markers like 'Fasl' or 'Hissa'.
5. If the title is not explicit, generate a high-literary Urdu title based on the context.`;