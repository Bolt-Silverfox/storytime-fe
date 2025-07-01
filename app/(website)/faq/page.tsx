import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Card, CardContent } from '@/components/ui/card';
import { InteractiveGridPattern } from '@/components/ui/interactive-grid-pattern';
import { faqPageItems } from '@/lib/data';

const faq = () => {
  return (
    <main className='space-y-[80px]'>
      <section className='relative py-40 pb-[80px]'>
        <InteractiveGridPattern width={150} height={150} />

        <h1 className='font-qilka relative font-bold text-[#221D1D] text-[59.8px] max-w-[926px] mx-auto text-center leading-[68px]'>
          Frequently Asked Questions
        </h1>
      </section>
      <section className='max-w-[1076px] mx-auto space-y-[60px]'>
        <Accordion type='single' collapsible className='w-full relative'>
          <p className='font-abeezee text-xl text-[#4A413F] pb-8'>
            General questions
          </p>
          {faqPageItems.slice(0, 3).map((item, index) => (
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
        <Accordion type='single' collapsible className='w-full'>
          <p className='font-abeezee text-xl text-[#4A413F] pb-8'>
            Parent control & safety
          </p>
          {faqPageItems.slice(3, 6).map((item, index) => (
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
        <Accordion type='single' collapsible className='w-full'>
          <p className='font-abeezee text-xl text-[#4A413F] pb-8'>
            Story features
          </p>
          {faqPageItems.slice(6, 9).map((item, index) => (
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
        <Accordion type='single' collapsible className='w-full'>
          <p className='font-abeezee text-xl text-[#4A413F] pb-8'>
            Account & payments
          </p>
          {faqPageItems.slice(6, 9).map((item, index) => (
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
        <Accordion type='single' collapsible className='w-full'>
          <p className='font-abeezee text-xl text-[#4A413F] pb-8'>
            Language & accessibility
          </p>
          {faqPageItems.slice(9, 12).map((item, index) => (
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
      </section>{' '}
      <section className='pb-[160px]'>
        <Card className='w-full max-w-[1140px] mx-auto bg-[#EC4007] rounded-[51px] border-[0.5px] border-solid border-[#f84020] p-[62px]'>
          <CardContent className='p-0 space-y-3'>
            <h2 className='font-qilka text-[60px] text-center font-bold text-white leading-[103.333%]'>
              Need more help?
            </h2>

            <p className='text-[#FEEAE6] text-center font-abeezee text-xl '>
              Email us anytime{' '}
              <a
                href='mailto:support@storytimeapp.me'
                className=' hover:underline'
              >
                support@storytimeapp.me
              </a>
            </p>
          </CardContent>
        </Card>
      </section>
    </main>
  );
};

export default faq;
