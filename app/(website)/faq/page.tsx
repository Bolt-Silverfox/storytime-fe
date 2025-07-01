import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
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
      </section>
    </main>
  );
};

export default faq;
