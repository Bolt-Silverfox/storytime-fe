import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { AvatarCircles } from '@/components/ui/avatar-circles';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Icons } from '@/components/ui/icons';
import { InteractiveGridPattern } from '@/components/ui/interactive-grid-pattern';
import {
  avatars,
  faqItems,
  featureCards,
  parentalFeatures,
  purpleFeatures,
  storyCategories,
  testimonials,
  yellowFeatures,
} from '@/lib/data';
import { cn } from '@/lib/utils';
import { Volume2Icon } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

export default function Home() {
  return (
    <main className='space-y-16'>
      <section className='relative py-40'>
        <InteractiveGridPattern width={150} height={150} />
        <section className='flex relative z-10 px-5  flex-col items-center gap-[60px] w-full max-w-[946px] mx-auto'>
          <div className='flex flex-col items-center gap-[42px] w-full'>
            <div className='flex  flex-col items-center gap-5 w-full'>
              <div className='flex flex-col items-center gap-6 w-full'>
                <Badge
                  variant='outline'
                  className='px-[22px] py-2 border-none bg-[#E6FBFE] text-[#07CAEC] font-abeezee rounded-[50px]'
                >
                  WELCOME TO STORYTIME
                </Badge>

                <h1 className='font-qilka font-bold text-[#221D1D] md:text-[60px] text-[44px] md:leading-[68px] leading-[50px] max-w-[926px] mx-auto text-center'>
                  Re-defining storytelling for kids with big imaginations
                </h1>
              </div>

              <p className='w-full max-w-[556px] text-lg text-[#4A413F] font-abeezee text-center'>
                Discover beautifully told tales, stories, created just for
                kids&nbsp;&nbsp;from bedtime snuggles to learning adventures and
                so much more.
              </p>
            </div>

            <Button
              variant='primary'
              className='md:w-[237px] w-full text-white rounded-[50px] px-[50px] py-2.5 gap-2.5'
              href='/register'
            >
              <Volume2Icon className='w-6 h-6' />
              <span className='font-regular-body'>Start listening</span>
            </Button>
          </div>

          <div className='flex items-center gap-4'>
            <AvatarCircles avatarUrls={avatars} />
            <div className='flex items-center gap-1.5'>
              <span className='text-xs whitespace-nowrap text-[#4A413F] font-abeezee'>
                Visited by over
              </span>
              <span className='font-bold whitespace-nowrap text-xl font-qilka text-[#EC4007] text-center'>
                5k visitors
              </span>
            </div>
          </div>
        </section>
      </section>
      <section className='relative px-5 grid-cols-6 grid w-full max-w-[990px] mx-auto gap-5'>
        <Image
          src='/landing-1.png'
          className='md:rounded-[12px_60px] rounded-[3.96px_19.8px] col-span-4 h-full'
          alt=''
          height={456}
          width={630}
        />
        <Image
          src='/landing-2.png'
          className='md:rounded-[12px_60px] rounded-[3.96px_19.8px] col-span-2 h-full'
          alt=''
          height={456}
          width={340}
        />

        <Icons.starOne className='absolute -bottom-25 left-[27%] md:scale-100 scale-40' />
        <Icons.starTwo className='absolute -bottom-6 -right-6 md:scale-100 scale-40' />
        <Icons.starThree className='absolute -top-16 -right-2 md:scale-100 scale-40' />
        <Icons.starFour className='absolute -top-23 -left-16 md:scale-100 scale-40' />
      </section>
      <section className='flex md:flex-row flex-col px-5 gap-[50px] py-16 w-full max-w-[1140px] mx-auto'>
        <div className='max-w-[419px] space-y-4'>
          <div className='space-y-3'>
            <h2 className='font-qilka font-bold text-[#221D1D] md:text-[60px] text-[44px] md:leading-[68px] leading-[50px]'>
              Explore story-telling like never before
            </h2>

            <p className='font-abeezee text-xl text-[#4A413F]'>
              Designed especially for children. With handpicked stories,
              friendly voices, and smart filters, it&apos;s more than
              entertainment it&apos;s a safe space for growth, imagination, and
              learning.
            </p>
          </div>
          <Icons.starOne className='mx-auto' />
        </div>

        <div className='grid md:grid-cols-2 gap-6 w-full'>
          {featureCards.map((card, index) => (
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
      <section className='flex px-5 flex-col items-center gap-[60px] w-full py-16 max-w-[1240px] mx-auto'>
        <div className='flex flex-col items-center gap-[60px] w-full'>
          <div className='space-y-3'>
            <h2 className='w-full max-w-[654px] leading-[113.636%] font-bold md:text-[44px] text-[34px] text-[#221D1D] font-qilka text-center'>
              A world of endless possibilities
            </h2>
            <p className='w-full max-w-[596px] text-xl text-[#4A413F] font-abeezee text-center'>
              We have so many categories to explore from
            </p>
          </div>

          <div className='grid md:grid-cols-3'>
            {storyCategories.map((category, index) => (
              <Card
                key={`category-${index}`}
                className='md:[&:nth-child(1)]:border-t-0 md:[&:nth-child(1)]:border-l-0 md:[&:nth-child(2)]:border-t-0 md:[&:nth-child(3)]:border-t-0 md:[&:nth-child(3)]:border-r-0 !border-b-0 md:[&:nth-child(4)]:border-l-0 md:last:border-r-0 md:border-4 border-l-0 p-8 border-[#F8EEEB] rounded-none shadow-none bg-transparent'
              >
                <CardContent className='flex flex-col items-start gap-6 p-0'>
                  <Image
                    src={category.image}
                    height={194}
                    width={301}
                    alt='Category Image'
                    className='rounded-[23px] w-full md:aspect-square'
                  />
                  <div className='flex flex-col items-start gap-3 w-full'>
                    <h3 className='text-[26px] font-bold font-qilka text-[#221D1D] '>
                      {category.title}
                    </h3>
                    <p className='text-xl font-abeezee text-[#4A413F]'>
                      {category.description}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        <Link
          href='/dashboard'
          className={cn(
            buttonVariants({ variant: 'outline' }),
            'rounded-full bg-transparent border-[#EC4007] text-[#EC4007] px-[54px] border h-auto py-2.5'
          )}
        >
          Browse all stories
        </Link>
      </section>
      <section className='px-5'>
        <Card className='w-full max-w-[1140px] md:mx-auto bg-[#EC4007] rounded-[51px] border-[0.5px] border-solid border-[#f84020] md:p-[62px] p-8'>
          <CardContent className='p-0'>
            <div className='flex md:flex-row flex-col items-center gap-[70px] w-full'>
              <div className='flex flex-col items-start gap-8 flex-1 max-w-[473px]'>
                <div className='space-y-3'>
                  <h2 className='font-qilka md:text-[60px] text-[34px] md:leading-[68px] leading-[50px] font-bold text-white'>
                    Built with kids in mind + AI integration
                  </h2>

                  <p className='text-[#FEEAE6] font-abeezee text-xl max-w-[500px]'>
                    A combination of intentionality, AI integration and
                    simplicity, we have created an amazing digital storybook to
                    aid your kids all the way through in their day to day lives.
                  </p>
                </div>

                <Button
                  variant='outline'
                  className='rounded-full bg-transparent text-white px-[54px] border h-auto py-2.5'
                >
                  Browse all stories
                </Button>
              </div>

              <Image
                src='/landing-3.png'
                height={473}
                width={366}
                className='rounded-[37px] w-full max-w-[473px]'
                alt='Digital storybook illustration'
              />
            </div>
          </CardContent>
        </Card>
      </section>
      <section className=' bg-[#4807EC] pt-[60px] space-y-[60px]'>
        <div className='space-y-3 '>
          <h2 className='font-qilka font-bold text-white text-[44px] text-center'>
            Tools that aids storytelling
          </h2>

          <p className='font-abeezee text-xl text-[#A583FB] text-center'>
            Built for young minds, backed by smart tools
          </p>
        </div>

        {/* Features section */}
        <div className='grid md:grid-cols-5 md:gap-[53px]'>
          <div className='md:col-span-3 flex md:items-end items-center flex-col md:py-[112px] py-[32px]'>
            <div className='space-y-[50px] px-5'>
              <div className='grid md:grid-cols-2 md:gap-x-[52px] gap-y-[62px] max-w-[706px] justify-between'>
                {purpleFeatures.map((feature, index) => (
                  <Card
                    key={index}
                    className=' md:max-w-[301px] space-y-3 md:col-span-1 bg-transparent border-none shadow-none'
                  >
                    <CardContent className='flex  flex-col items-start gap-3 relative self-stretch w-full p-0'>
                      <h3 className='text-[26px] font-bold text-white font-qilka'>
                        {feature.title}
                      </h3>
                      <p className='text-xl font-abeezee text-[#A583FB]'>
                        {feature.description}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <Button
                variant='secondary'
                type='submit'
                className='px-[50px] h-auto py-4 rounded-full md:w-max w-full '
                href='/login'
              >
                Get started
              </Button>
            </div>
          </div>

          <div className='space-y-[62px] bg-[#ECC607] md:py-[112px] py-8 md:col-span-2 w-full md:px-[80px]'>
            {yellowFeatures.map((feature, index) => (
              <Card
                key={index}
                className='md:max-w-[301px] px-5 space-y-3 bg-transparent border-none shadow-none'
              >
                <CardContent className='flex  flex-col items-start gap-3 relative self-stretch w-full p-0'>
                  <h3 className='text-[26px] font-bold text-[#221D1D] font-qilka'>
                    {feature.title}
                  </h3>
                  <p className='text-xl font-abeezee text-[#4A413F]'>
                    {feature.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>
      <section className=' max-w-[1140px] px-5 space-y-[60px] mx-auto py-16'>
        <div className='space-y-3'>
          <h2 className='font-qilka font-bold text-[#221D1D] md:text-[44px] text-[34px] text-center'>
            Complete Parental control
          </h2>
          <p className='font-abeezee text-xl text-[#4A413F] text-center'>
            Control and customize your child’s story experience
          </p>
        </div>

        <div className='flex flex-col md:flex-row items-center gap-[70px] w-full'>
          <Image
            src='/landing-4.png'
            height={535}
            width={646}
            className='rounded-[37px] w-full max-w-[473px]'
            alt='Digital storybook illustration'
          />
          <div className='flex flex-col items-start gap-8 flex-1'>
            <div className='flex flex-col items-start gap-6 w-full'>
              <div className='space-y-3'>
                <h2 className='font-qilka font-bold text-[#221D1D] md:text-[44px] text-[34px]'>
                  Stay in control always
                </h2>
                <p className='font-abeezee text-xl text-[#4A413F] text-center'>
                  Access to features that help your kids stay safe.
                </p>
              </div>

              <div className='flex flex-col items-start gap-8 w-full'>
                {parentalFeatures.map((feature, index) => (
                  <div
                    key={`feature-${index}`}
                    className='flex items-center gap-3 w-full'
                  >
                    <Icons.check />
                    <p className='font-abeezee text-xl text-[#4A413F] text-center'>
                      {feature}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <Button
              variant='primary'
              type='submit'
              className='px-[100px] h-auto py-2.5'
              href='/register'
            >
              Start listening
            </Button>
          </div>
        </div>
      </section>

      <section className='space-y-10 px-5 md:py-20 max-w-[1140px] mx-auto'>
        <div className='flex md:flex-row flex-col gap-[50px]'>
          <div className='space-y-3 col-span-5 max-w-[419px]'>
            <h2 className='font-qilka font-bold text-[#221D1D] md:text-[60px] text-[44px] md:leading-[68px] leading-[50px]'>
              Loved by families everywhere
            </h2>
            <p className='font-abeezee text-xl text-[#4A413F]'>
              Hear from parents who have engaged with out product.
            </p>
          </div>
          <div className='grid md:grid-cols-2 gap-[25px] w-full'>
            {testimonials.slice(0, 2).map((testimonial, index) => (
              <Card
                key={`top-testimonial-${index}`}
                className='w-full col-span-1 bg-white shadow-none rounded-[21px] border-[0.5px] border-solid border-stone-100'
              >
                <CardContent className='flex flex-col items-start gap-6 p-8'>
                  <p className='text-xl tetx-[#4A413F] font-abeezee'>
                    &quot;{testimonial.quote}&quot;
                  </p>
                  <div className='flex items-center gap-2 self-stretch w-full'>
                    <Avatar className='size-10 bg-blue-shade06 rounded-full border-[0.5px] border-solid border-[#eaeef9]'>
                      <AvatarFallback>
                        {testimonial.name.charAt(0)}
                      </AvatarFallback>
                    </Avatar>
                    <div className='flex flex-col items-start flex-1'>
                      <p className='text-[#221D1D] font-abeezee'>
                        {testimonial.name}
                      </p>
                      <p className='text-xs font-abeezee text-[#4A413F]'>
                        {testimonial.location}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
        <div className='grid md:grid-cols-3 gap-x-[25px] gap-y-10 w-full'>
          {testimonials.slice(2).map((testimonial, index) => (
            <Card
              key={`top-testimonial-${index}`}
              className='w-full col-span-1 bg-white shadow-none rounded-[21px] border-[0.5px] border-solid border-stone-100'
            >
              <CardContent className='flex flex-col items-start gap-6 p-8'>
                <p className='text-xl tetx-[#4A413F] font-abeezee'>
                  &quot;{testimonial.quote}&quot;
                </p>
                <div className='flex items-center gap-2 self-stretch w-full'>
                  <Avatar className='size-10 bg-blue-shade06 rounded-full border-[0.5px] border-solid border-[#eaeef9]'>
                    <AvatarFallback>
                      {testimonial.name.charAt(0)}
                    </AvatarFallback>
                  </Avatar>
                  <div className='flex flex-col items-start flex-1'>
                    <p className='text-[#221D1D] font-abeezee'>
                      {testimonial.name}
                    </p>
                    <p className='text-xs font-abeezee text-[#4A413F]'>
                      {testimonial.location}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className='space-y-[60px] px-5 py-[80px] md:py-[160px] max-w-[1140px] mx-auto'>
        <div className='space-y-[60px]'>
          <div className='space-y-3'>
            <h2 className='font-qilka font-bold text-[#221D1D] md:text-[60px] text-[44px] md:leading-[68px] leading-[50px] text-center'>
              Common questions
            </h2>
            <p className='font-abeezee text-xl text-[#4A413F] text-center'>
              See common questions asked
            </p>
          </div>

          <Accordion type='single' collapsible className='w-full'>
            {faqItems.map((item, index) => (
              <AccordionItem
                key={`faq-${index}`}
                value={`item-${index}`}
                className='mb-4 bg-white rounded-[27px] border-[0.5px] border-solid border-stone-100'
              >
                <AccordionTrigger className='px-8 py-6 text-xl hover:no-underline'>
                  {item.question}
                </AccordionTrigger>
                <AccordionContent className='px-8 pb-6 text-xl'>
                  {item.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
        <Button
          variant='outline'
          className='rounded-full bg-transparent mx-auto block border-[#EC4007] text-[#EC4007] px-[54px] border h-auto py-2.5 w-fit'
          href='/faq'
        >
          See all
        </Button>
      </section>
    </main>
  );
}
