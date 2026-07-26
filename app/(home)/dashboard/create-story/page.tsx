'use client';

import Header from '@/components/header';
import KidPicker from '@/components/kid-picker';
import StoryReader from '@/components/story-reader';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  cancelStoryJobService,
  generateStoryAsyncService,
  getStoryCategoriesService,
  getStoryThemesService,
} from '@/lib/services';
import { subscribeToStoryJob } from '@/lib/story-generation-events';
import { cn, languageOptions } from '@/lib/utils';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

interface NamedItem {
  id: string;
  name: string;
}

type Phase = 'form' | 'generating' | 'done';

const CreateStoryPage = () => {
  const [phase, setPhase] = useState<Phase>('form');

  // Selection state.
  const [kidId, setKidId] = useState<string | null>(null);
  const [kidName, setKidName] = useState<string | null>(null);
  const [themes, setThemes] = useState<NamedItem[]>([]);
  const [categories, setCategories] = useState<NamedItem[]>([]);
  const [selectedThemes, setSelectedThemes] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [ageRange, setAgeRange] = useState<string>('4-8');
  const [language, setLanguage] = useState<string>('en');
  const [additionalContext, setAdditionalContext] = useState('');

  // Generation state.
  const [jobId, setJobId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('Queued…');
  const [generatedStoryId, setGeneratedStoryId] = useState<string | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    // Pick up a kid already chosen elsewhere in the dashboard.
    const stored = localStorage.getItem('selectedKid');
    if (stored) {
      try {
        const kid = JSON.parse(stored);
        setKidId(kid.id);
        setKidName(kid.name ?? null);
      } catch {
        // ignore malformed cache
      }
    }
  }, []);

  useEffect(() => {
    const load = async () => {
      try {
        const [themeData, categoryData] = await Promise.all([
          getStoryThemesService(),
          getStoryCategoriesService(),
        ]);
        setThemes(Array.isArray(themeData) ? themeData : []);
        setCategories(Array.isArray(categoryData) ? categoryData : []);
      } catch (error) {
        console.error('Failed to load themes/categories:', error);
      }
    };
    load();
  }, []);

  // Tear down any live SSE subscription on unmount.
  useEffect(() => {
    return () => {
      unsubscribeRef.current?.();
    };
  }, []);

  const handleKidSelect = (selectedKidId: string) => {
    setKidId(selectedKidId);
    const stored = localStorage.getItem('selectedKid');
    if (stored) {
      try {
        setKidName(JSON.parse(stored).name ?? null);
      } catch {
        setKidName(null);
      }
    }
  };

  const toggle = (
    value: string,
    list: string[],
    setter: (next: string[]) => void
  ) => {
    setter(
      list.includes(value) ? list.filter((v) => v !== value) : [...list, value]
    );
  };

  const handleGenerate = async () => {
    const [ageMinRaw, ageMaxRaw] = ageRange.split('-');
    const ageMin = Number.parseInt(ageMinRaw, 10);
    const ageMax = Number.parseInt(ageMaxRaw, 10);

    setPhase('generating');
    setProgress(0);
    setProgressMessage('Queued…');

    try {
      const enqueue = await generateStoryAsyncService({
        ...(kidId ? { kidId } : {}),
        ...(kidName ? { kidName } : {}),
        ...(selectedThemes.length ? { themes: selectedThemes } : {}),
        ...(selectedCategories.length
          ? { categories: selectedCategories }
          : {}),
        ...(Number.isFinite(ageMin) ? { ageMin } : {}),
        ...(Number.isFinite(ageMax) ? { ageMax } : {}),
        ...(language ? { language } : {}),
        ...(additionalContext.trim()
          ? { additionalContext: additionalContext.trim() }
          : {}),
      });

      if (!enqueue.queued) {
        throw new Error(enqueue.error || 'Could not queue story generation');
      }

      setJobId(enqueue.jobId);

      unsubscribeRef.current = subscribeToStoryJob(enqueue.jobId, {
        onProgress: (value, message) => {
          setProgress(value);
          if (message) {
            setProgressMessage(message);
          }
        },
        onCompleted: (result) => {
          setProgress(100);
          if (result.storyId) {
            setGeneratedStoryId(result.storyId);
            setPhase('done');
          } else {
            toast.error('Story finished but no story id was returned.');
            setPhase('form');
          }
        },
        onFailed: (error) => {
          toast.error(error || 'Story generation failed');
          setPhase('form');
        },
      });
      // biome-ignore lint/suspicious/noExplicitAny: service error shape
    } catch (error: any) {
      toast.error(error?.message || 'Could not start story generation');
      setPhase('form');
    }
  };

  const handleCancel = async () => {
    unsubscribeRef.current?.();
    unsubscribeRef.current = null;
    if (jobId) {
      try {
        const res = await cancelStoryJobService(jobId);
        if (res.cancelled) {
          toast.success('Story generation cancelled');
        } else {
          toast.info(res.reason || 'Job could not be cancelled');
        }
      } catch {
        // best-effort cancel
      }
    }
    setPhase('form');
    setJobId(null);
  };

  return (
    <div className='bg-white rounded-[2.5625rem] border-[0.5px] border-solid border-[#FAF4F2] px-10 py-[2.125rem] max-w-[85vw] mx-auto my-12'>
      <Header white={false} />

      <div className='mt-8'>
        <h1 className='text-[#221D1D] text-[34px] font-bold font-qilka'>
          Create a story
        </h1>
        <p className='text-[#4A413F] font-abeezee'>
          Personalize a brand-new AI story for your child
        </p>
      </div>

      {phase === 'form' && (
        <div className='mt-8 space-y-10'>
          {/* Kid picker */}
          <div>
            <KidPicker onKidSelect={handleKidSelect} />
            {kidId && (
              <p className='mt-4 text-[#EC4007] font-abeezee'>
                Generating for {kidName || 'selected child'}
              </p>
            )}
          </div>

          {/* Themes */}
          <div className='space-y-3'>
            <h2 className='text-xl font-bold font-qilka'>Themes</h2>
            <div className='flex flex-wrap gap-2.5'>
              {themes.map((theme) => (
                <button
                  key={theme.id}
                  type='button'
                  onClick={() =>
                    toggle(theme.name, selectedThemes, setSelectedThemes)
                  }
                  className={cn(
                    'rounded-full border px-4 py-2 font-abeezee text-sm transition-colors',
                    selectedThemes.includes(theme.name)
                      ? 'bg-[#EC4007] text-white border-[#EC4007]'
                      : 'bg-white text-[#221D1D] border-[#FAF4F2]'
                  )}
                >
                  {theme.name}
                </button>
              ))}
            </div>
          </div>

          {/* Categories */}
          <div className='space-y-3'>
            <h2 className='text-xl font-bold font-qilka'>Categories</h2>
            <div className='flex flex-wrap gap-2.5'>
              {categories.map((category) => (
                <button
                  key={category.id}
                  type='button'
                  onClick={() =>
                    toggle(
                      category.name,
                      selectedCategories,
                      setSelectedCategories
                    )
                  }
                  className={cn(
                    'rounded-full border px-4 py-2 font-abeezee text-sm transition-colors',
                    selectedCategories.includes(category.name)
                      ? 'bg-[#EC4007] text-white border-[#EC4007]'
                      : 'bg-white text-[#221D1D] border-[#FAF4F2]'
                  )}
                >
                  {category.name}
                </button>
              ))}
            </div>
          </div>

          {/* Age range + language */}
          <div className='grid grid-cols-1 md:grid-cols-2 gap-6 max-w-[720px]'>
            <div className='space-y-1.5'>
              <label
                htmlFor='age-range'
                className='text-[#4A413F] text-sm font-abeezee'
              >
                Age range
              </label>
              <Select value={ageRange} onValueChange={setAgeRange}>
                <SelectTrigger id='age-range' className='w-full'>
                  <SelectValue placeholder='Select age range' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='2-4'>2 - 4 yrs</SelectItem>
                  <SelectItem value='4-6'>4 - 6 yrs</SelectItem>
                  <SelectItem value='4-8'>4 - 8 yrs</SelectItem>
                  <SelectItem value='7-9'>7 - 9 yrs</SelectItem>
                  <SelectItem value='10-13'>10 - 13 yrs</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className='space-y-1.5'>
              <label
                htmlFor='language'
                className='text-[#4A413F] text-sm font-abeezee'
              >
                Language
              </label>
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger id='language' className='w-full'>
                  <SelectValue placeholder='Select language' />
                </SelectTrigger>
                <SelectContent>
                  {languageOptions.map((lang) => (
                    <SelectItem key={lang.value} value={lang.value}>
                      {lang.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Additional context */}
          <div className='space-y-1.5 max-w-[720px]'>
            <label
              htmlFor='additional-context'
              className='text-[#4A413F] text-sm font-abeezee'
            >
              Anything special? (optional)
            </label>
            <Textarea
              id='additional-context'
              value={additionalContext}
              onChange={(e) => setAdditionalContext(e.target.value)}
              placeholder='e.g. include a brave little fox who loves the ocean'
              rows={4}
            />
          </div>

          <Button
            variant='primary'
            onClick={handleGenerate}
            className='py-[15px] h-auto px-10'
          >
            Generate story
          </Button>
        </div>
      )}

      {phase === 'generating' && (
        <div className='mt-12 max-w-[560px] mx-auto text-center space-y-6'>
          <h2 className='text-2xl font-bold font-qilka text-[#221D1D]'>
            Creating your story…
          </h2>
          <Progress value={progress} className='h-3' />
          <p className='text-[#4A413F] font-abeezee'>
            {progressMessage} ({Math.round(progress)}%)
          </p>
          <Button
            variant='outline'
            onClick={handleCancel}
            className='rounded-full border-[#EC4007] text-[#EC4007] py-[15px] h-auto px-10'
          >
            Cancel
          </Button>
        </div>
      )}

      {phase === 'done' && generatedStoryId && (
        <div className='mt-10'>
          <StoryReader
            img=''
            title='Your new story'
            description=''
            voice='Nimbus'
            setStep={() => undefined}
            expand={false}
            mode='plain'
            storyId={generatedStoryId}
          />
        </div>
      )}
    </div>
  );
};

export default CreateStoryPage;
