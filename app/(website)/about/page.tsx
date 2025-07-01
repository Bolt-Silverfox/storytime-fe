import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Icons } from '@/components/ui/icons';
import { InteractiveGridPattern } from '@/components/ui/interactive-grid-pattern';
import { featureCard2, featureCards } from '@/lib/data';
import Image from 'next/image';

const Page = () => {
  return (
    <main className='space-y-16'>
      <section className='relative py-40'>
        <InteractiveGridPattern width={150} height={150} />
        <section className='flex relative z-10 flex-col items-center gap-[60px] w-full max-w-[946px] mx-auto'>
          <div className='flex flex-col items-center gap-[42px] w-full'>
            <div className='flex flex-col items-center gap-5 w-full'>
              <div className='flex flex-col items-center gap-6 w-full'>
                <h1 className='font-qilka font-bold text-[#221D1D] text-[59.8px] max-w-[926px] mx-auto text-center leading-[68px]'>
                  More than stories, a world of wonder for every child
                </h1>
              </div>

              <p className='w-full max-w-[556px] text-lg text-[#4A413F] font-abeezee text-center'>
                At Storytime, we believe storytelling can shape hearts, spark
                imaginations, and bring families closer.
              </p>
            </div>

            <Button
              variant='primary'
              className='w-[237px] text-white rounded-[50px] px-[50px] py-4 gap-2.5 h-auto'
            >
              Get started
            </Button>
          </div>
        </section>
      </section>

      <section className='py-[80px] w-full max-w-[905px] mx-auto gap-5'>
        <div className='relative'>
          <Image
            src='/about-a.png'
            className='rounded-[12px_60px] w-full h-full'
            alt=''
            height={456}
            width={905}
          />

          <Icons.starOne className='absolute -bottom-25 left-[27%]' />
          <Icons.starThree className='absolute -top-16 -right-2' />
          <Icons.starTwo className='absolute -top-5 -left-5' />
        </div>
      </section>
      <section className='flex max-w-[1140px] mx-auto py-[80px]'>
        <div className='space-y-4 max-w-[505px]'>
          <h2 className='font-qilka font-bold text-[#221D1D] text-6xl'>
            Explore story-telling like never before
          </h2>

          <p className='font-abeezee text-xl text-[#4A413F]'>
            Designed especially for children. With handpicked stories, friendly
            voices, and smart filters, it&apos;s more than entertainment
            it&apos;s a safe space for growth, imagination, and learning.
          </p>
          <p className='font-qilka text-xl text-[#4A413F] pt-2'>
            We built Storytime to nurture curiosity and connection. Our stories
            help children fall asleep, wake up happy, and grow with values that
            matter.
          </p>
        </div>
        <Image
          src='/about-b.png'
          height={456}
          width={542}
          alt='Category Image'
          className='rounded-[23px] w-full max-w-[542px] ml-auto'
        />
      </section>
      <section className='max-w-[1140px] mx-auto space-y-[60px]'>
        <div className='space-y-3'>
          <h2 className='w-full max-w-[654px] mx-auto leading-[113.636%] font-bold text-[44px] text-[#221D1D] font-qilka text-center'>
            What makes us different
          </h2>
          <p className='w-full max-w-[596px] mx-auto text-xl text-[#4A413F] font-abeezee text-center'>
            StoryTime is built with intentionality in mind
          </p>
        </div>

        <div className='grid grid-cols-2 gap-6 w-full'>
          {featureCard2.map((card, index) => (
            <Card
              key={`feature-card-top-${index}`}
              className='border-[0.5px] border-solid shadow-none border-stone-100 rounded-[21px] bg-white'
            >
              <CardContent className='flex flex-col items-start gap-2.5 p-8'>
                <div className='flex flex-col items-start gap-6 w-full'>
                  <div
                    className={`inline-flex items-center gap-2.5 p-4 ${card.iconBg} rounded-[17px] border border-solid ${card.iconBorder}`}
                  >
                    <card.icon className='w-6 h-6' />
                  </div>

                  <div className='space-y-3'>
                    <h3 className='font-bold font-qilka text-[#221D1D] text-xl'>
                      {card.title}
                    </h3>

                    <p className='font-abeezee text-xl text-[#4A413F]'>
                      {card.description}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className='max-w-[1140px] py-[80px] mx-auto flex items-center gap-8'>
        <div className='rounded-[37px] overflow-hidden w-max bg-white'>
          <div className='space-y-3 py-[42px] px-8'>
            <h2 className='w-full max-w-[654px] mx-auto leading-[113.636%] font-bold text-[44px] text-[#221D1D] font-qilka'>
              Our mission
            </h2>
            <p className='w-full max-w-[596px] mx-auto text-xl text-[#4A413F] font-abeezee'>
              To make storytelling magical again by giving every child access to
              stories that are joyful, calming, and full of meaning.
            </p>
          </div>
          <Image src='/about-c.png' alt='' height={356} width={554} />
        </div>
        <div className='rounded-[37px] overflow-hidden w-max bg-white'>
          <div className='space-y-3 py-[42px] px-8'>
            <h2 className='w-full max-w-[654px] mx-auto leading-[113.636%] font-bold text-[44px] text-[#221D1D] font-qilka '>
              Our vision
            </h2>
            <p className='w-full max-w-[596px] mx-auto text-xl text-[#4A413F] font-abeezee '>
              A future where screen-free, audio-first experiences become the
              foundation for how kids learn, imagine, and connect.
            </p>
          </div>
          <Image src='/about-c.png' alt='' height={356} width={554} />
        </div>
      </section>

      <section className='pt-[80px] pb-[160px]'>
        <Card className='w-full max-w-[1140px] mx-auto bg-[#EC4007] rounded-[51px] border-[0.5px] border-solid border-[#f84020] p-[62px]'>
          <CardContent className='p-0'>
            <div className='flex items-center gap-[70px] w-full'>
              <div className='flex flex-col items-start gap-8 flex-1 max-w-[473px]'>
                <div className='space-y-3'>
                  <h2 className='font-qilka text-[60px] font-bold text-white leading-[103.333%]'>
                    Want to join the movement
                  </h2>

                  <p className='text-[#FEEAE6] font-abeezee text-xl max-w-[500px]'>
                    Let’s build a world where stories still matter.
                  </p>
                </div>

                <Button
                  variant='outline'
                  className='rounded-full bg-transparent text-white px-[54px] border h-auto py-2.5'
                >
                  Create an account today
                </Button>
              </div>

              <Image
                src='/about-d.png'
                height={473}
                width={366}
                className='rounded-[37px] w-full max-w-[473px]'
                alt='Digital storybook illustration'
              />
            </div>
          </CardContent>
        </Card>
      </section>
    </main>
  );
};

export default Page;
