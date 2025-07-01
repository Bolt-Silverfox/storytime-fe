import { Card, CardContent } from '@/components/ui/card';
import { InteractiveGridPattern } from '@/components/ui/interactive-grid-pattern';
import { termsSections } from '@/lib/data';
import React from 'react';

const Page = () => {
  return (
    <main className='space-y-[80px] pb-[140px]'>
      <section className='relative pt-40 '>
        <InteractiveGridPattern width={150} height={150} />

        <div className='flex relative flex-col items-center gap-5 w-full'>
          <h1 className='font-qilka font-bold text-[#221D1D] text-[59.8px] max-w-[926px] mx-auto text-center leading-[68px]'>
            Terms and conditions
          </h1>
          <p className='w-full max-w-[556px] text-lg text-[#4A413F] font-abeezee text-center'>
            Updated last 6/19/2025
          </p>
        </div>
      </section>
      <section className='max-w-[1128px] mx-auto'>
        <Card className='w-full border-none bg-transparent shadow-none'>
          <CardContent className='flex flex-col items-start gap-[42px] p-0'>
            {termsSections.map((section, index) => (
              <div
                key={index}
                className='flex flex-col items-start gap-3 w-full'
              >
                <h2 className='w-full text-xl text-[#221D1D] font-bold font-qilka'>
                  {section.title}
                </h2>

                <p className='w-full font-abeezee text-xl text-[#4A413F]'>
                  {section.content}
                </p>

                {section.bulletPoints && (
                  <ul className='flex flex-col items-start gap-3 list-disc pl-6 w-full mt-3'>
                    {section.bulletPoints.map((point, idx) => (
                      <li
                        key={idx}
                        className='w-full font-abeezee text-xl text-[#4A413F]'
                      >
                        {point}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      </section>
    </main>
  );
};

export default Page;
