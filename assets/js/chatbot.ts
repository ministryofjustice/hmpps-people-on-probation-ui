import { init } from '@justiceaiunit/chatbot-widget'
import '@justiceaiunit/chatbot-widget/style.css'

init({
  container: '#chatbot-root',
  apiBaseUrl: '/api/chatbot/chat',
  domain: 'pop',
  config: {
    assistantName: 'Fred',
    displayTitle: 'AI Probation Assistant',
    placeholder: 'Ask a question...',
    welcomeMessage: `Hi, I'm Fred 👋
How can I help you today?

---

**Before you start**

I use information from your probation record to answer your questions.

I cannot:
- change your probation record
- make decisions about your case
- provide legal advice

By using Fred, you agree to the Privacy Notice. [Read the Privacy Notice](#privacy)`,
    suggestedQuestions: [
      'What happens at my first appointment?',
      'Can I travel abroad?',
      'What are my order requirements?',
    ],
    privacyMessage: `# Privacy Notice – Probation chatbot

## Purpose

This privacy notice explains how the Probation chatbot service ("Fred") uses your personal information.

Fred is an AI-powered chatbot available through the 'Check your probation account' service. It gives people on probation access to information about their probation case, including appointments, requirements and contact details for their probation practitioner.

Fred can provide information about your probation record, but it cannot make decisions about your case, provide legal advice, or replace your probation practitioner. If you need advice, support, or believe information held about you is incorrect, you should contact your probation practitioner directly.

## How the Probation chatbot works

When you ask a question, the chatbot securely retrieves relevant information from probation systems to help answer your question. Your question and relevant case information are sent to Microsoft Azure AI Foundry to generate a response.

The chatbot has read-only access to probation records. It cannot make decisions about your case or change any information held about you or your probation case.

## What information we use

To provide this chatbot, we process the following categories of personal data:

### Your account and identity information

- Name
- Case reference identifiers used to retrieve your records

### Probation case information

The chatbot may access information held in probation records, including, but not limited to:

- Appointment information
- Order and requirement details
- Contact details for you and your probation practitioner
- Other information relevant to answering questions about your probation case accurately and securely

### Messages you submit

We process:

- Questions and messages you type into the chatbot
- The chatbot responses generated during your session

### Special category and criminal offence data

To answer questions about your probation case, the chatbot may process sensitive information already held in your probation record, such as health information, ethnicity, religion or information about criminal convictions.

## Who is responsible for your information?

The Ministry of Justice (MoJ) is responsible for how your personal information is used by the Probation chatbot service. This is known as the data controller.

## Purpose of processing and the lawful basis for the process

We use your personal information to provide the Probation chatbot service. This allows the chatbot to answer your questions and provide personalised information about your probation case using information held in probation systems.

The legal basis for processing your personal data is Article 6(1)(e) UK GDPR. This allows for processing that is necessary for the performance of a task carried out in the public interest or in the exercise of official authority vested in the data controller.

Where the chatbot processes special category data (such as health information, ethnicity or religion) or criminal offence data, this is carried out under the Data Protection Act 2018 for statutory and government purposes and the administration of justice.

You can choose whether to use this chatbot. However, the legal basis for processing your information is the public task described above, not your consent.

## Who processes your information

Your personal data will be processed by:

- Microsoft Azure AI Foundry and associated Azure cloud services, which generate chatbot responses and support the operation of the chatbot.
- Amazon Web Services (AWS) managed databases (PostgreSQL) hosted on the MoJ Cloud Platform in the UK, which securely store chatbot messages and responses during the retention period.

Microsoft and AWS act as data processors on behalf of the MoJ and do not act as joint controllers.

### International Transfers

The Azure AI Foundry deployment used by the chatbot is hosted in Sweden. Where personal data is transferred outside the UK, appropriate safeguards such as Standard Contractual Clauses are in place.

## Retention period for information collected

Questions submitted by users and chatbot responses are retained for 90 days from the date they are created, after which they are automatically deleted.

Information retrieved from probation systems to answer your question is used only for the duration of your session and is not permanently stored by the chatbot.

## Your rights

You have the right to:

- Request access to your personal information.
- Request correction of inaccurate information.
- Request deletion of retained chatbot messages where applicable.
- Request restriction of processing in certain circumstances.
- Object to the processing of your personal data.

### Access to personal information

You can find out if we hold any personal data about you by making a 'subject access request'. If you wish to make a subject access request, please speak to your probation practitioner who can discuss how you do this. Alternatively, you may send your request for personal information to this email address, and we will process your request as required under the data protection legislation. Data.Access1@justice.gov.uk

## Complaints

When we ask you for information, we will keep to the law. If you consider that your personal information has been handled incorrectly, you can contact the Information Commissioner for independent advice about data protection. You can contact the Information Commissioner at:

Information Commissioner's Office\\
Wycliffe House\\
Water Lane\\
Wilmslow\\
Cheshire\\
SK9 5AF

Tel: 0303 123 1113

www.ico.org.uk

The data controller for your personal data is the Ministry of Justice (MoJ). The contact details for the data controller are:

Ministry of Justice\\
102 Petty France\\
London\\
SW1H 9AJ

Tel: 020 3334 3555.

The contact details for the data controller's Data Protection Officer are: dataprotection@justice.gov.uk.

The Data Protection Officer provides independent advice and monitoring of the Ministry of Justice's use of personal information.`,
  },
})
