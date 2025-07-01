import { Card, CardContent } from '@/components/ui/card';
import { InteractiveGridPattern } from '@/components/ui/interactive-grid-pattern';
import { privacySections, termsSections } from '@/lib/data';
import React from 'react';

const Page = () => {
  return (
    <main className='space-y-[80px] pb-[140px]'>
      <section className='relative pt-40 '>
        <InteractiveGridPattern width={150} height={150} />

        <div className='flex relative flex-col items-center gap-5 w-full'>
          <h1 className='font-qilka font-bold text-[#221D1D] text-[59.8px] max-w-[926px] mx-auto text-center leading-[68px]'>
            Privacy policy
          </h1>
          <p className='w-full max-w-[556px] text-lg text-[#4A413F] font-abeezee text-center'>
            Updated last 6/19/2025
          </p>
        </div>
      </section>
      <section className='max-w-[1128px] mx-auto px-5'>
        <Card className='w-full border-none bg-transparent shadow-none'>
          <CardContent className='flex flex-col items-start gap-[42px] p-0'>
            {privacySections.map((section, index) => (
              <div
                key={index}
                className='flex flex-col items-start gap-3 w-full'
              >
                <h2 className='w-full md:text-xl text-[26px] text-[#221D1D] font-bold font-qilka'>
                  {section.title}
                </h2>

                <p className='w-full font-abeezee text-xl text-[#4A413F]'>
                  {section.content}
                </p>

                {section.bulletPoints && (
                  <ul className='flex flex-col items-start gap-3 w-full mt-3 ml-6'>
                    {section.bulletPoints.map((point, idx) => (
                      <li
                        key={idx}
                        className='w-full font-abeezee text-xl text-[#4A413F] list-disc'
                      >
                        {point}
                      </li>
                    ))}
                  </ul>
                )}

                {section.subsections && (
                  <div className='flex flex-col items-start gap-6 w-full mt-6'>
                    {section.subsections.map((subsection, idx) => (
                      <div
                        key={idx}
                        className='flex flex-col items-start gap-2 w-full'
                      >
                        <h3 className='w-full md:text-xl text-[26px] text-[#221D1D] font-bold font-qilka'>
                          {subsection.subtitle}
                        </h3>
                        <p className='w-full font-abeezee text-xl text-[#4A413F]'>
                          {subsection.content}
                        </p>
                      </div>
                    ))}
                  </div>
                )}

                {section.contactInfo && (
                  <div className='flex flex-col items-start gap-3 w-full mt-3'>
                    <p className='w-full font-regular-h4 text-body-shadelight'>
                      <strong>Email:</strong> {section.contactInfo.email}
                    </p>
                    <p className='w-full font-regular-h4 text-body-shadelight'>
                      <strong>Address:</strong> {section.contactInfo.address}
                    </p>
                    <p className='w-full font-regular-h4 text-body-shadelight'>
                      <strong>Phone:</strong> {section.contactInfo.phone}
                    </p>
                  </div>
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
