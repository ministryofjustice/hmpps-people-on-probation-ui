import { getPopChatbotConfig } from '@/lib/popChatbot'
import type {
  PopAppointment,
  PopAppointmentsDetails,
  PopOrderSummary,
  PopProbationOfficerDetails,
  PopProgressDetails,
  PopUserDetails,
} from './index'

export type PopStaticProfile = {
  dashboard: PopStaticProfileDashboard
  userDetails: PopUserDetails
  probationOfficerDetails: PopProbationOfficerDetails
  orderSummary: PopOrderSummary
  progress: PopProgressDetails
  appointments: PopAppointmentsDetails
}

type PopStaticProfileDashboard = {
  welcomeName: string
  cards: {
    title: string
    description: string
    href: string
    action?: 'open-chatbot'
  }[]
  chatbot?: {
    title: string
    closeLabel: string
    inputPlaceholder: string
    sendLabel: string
  }
}

function buildAppointment(appointment: PopAppointment): PopAppointment {
  return appointment
}

function createScenarioOneProfile(crn: string): PopStaticProfile {
  return {
    dashboard: {
      welcomeName: 'Joe Bloggs',
      cards: [
        {
          title: 'Personal details',
          description: 'Your personal contact details and emergency contact details',
          href: '/your-details',
        },
        {
          title: 'Probation officer details',
          description: "Your probation officer's contact details",
          href: '/probation-officer-details',
        },
        {
          title: 'Your progress',
          description: 'Your progress in unpaid work, community orders and other conditions',
          href: '/your-progress',
        },
        {
          title: 'Your probation requirements',
          description: 'The rules you need to follow as part of your probation',
          href: '/conditions',
        },
        {
          title: 'Your appointments',
          description: 'A list of some of your past and future appointments',
          href: '/appointments',
        },
        {
          title: 'Probation service expectations',
          description: 'What probation expects of you',
          href: '/expectations',
        },
      ],
    },
    userDetails: {
      userId: crn,
      pageTitle: 'Personal details',
      lastUpdated: '10 April 2026, 2.29pm',
      intro: 'If you need to update any of your details, you should contact your probation officer and let them know.',
      personalDetailsTitle: 'Your personal details',
      contactDetailsTitle: 'Your contact details',
      hideIdentityNumbers: true,
      hideProbationPractitionerDetails: true,
      name: 'Joe Bloggs',
      preferredName: 'Joey',
      dateOfBirth: '15 March 1999',
      address: '123 Example Street\nLondon\nSW1A 1AA',
      phone: '07700 900123',
      mobile: '07912 345678',
      email: 'joe.bloggs@email.com',
      emergencyContact: {
        name: 'Jane Bloggs',
        relationship: 'Spouse',
        phone: '07700 900456',
      },
      probationPractitioner: {
        name: 'Sarah Smith',
        phone: '020 7946 0958',
        officeAddress: 'National Probation Service\n235 Greenwich High Road\nLondon\nSE10 8NB',
        email: '{general email}',
      },
    },
    probationOfficerDetails: {
      pageTitle: 'Probation officer details',
      lastUpdated: '10 April 2026, 2.29pm',
      intro: 'If you need to update any of your details, you should contact your probation officer and let them know.',
      sectionTitle: 'Probation officer details',
      name: 'Sarah Smith',
      phone: '020 7946 0958',
      officeAddress: 'National Probation Service\n235 Greenwich High Road\nLondon\nSE10 8NB',
      email: '{general email}',
      emailHref: '#',
    },
    orderSummary: {
      pageTitle: 'Your probation requirements',
      intro:
        'These are the conditions of your probation. Not following these rules can lead to you being breached. This means you could end up having more rules added to your probation, going back to court or going back to prison.',
      orderDetailsTitle: 'Order details',
      rulesTitle: 'Rules of your order',
      rulesAction: {
        label: 'View progress',
        href: '/your-progress',
      },
      orderType: 'Community order',
      startDate: '15 January 2026',
      requirementsCompletionDate: '14 January 2027',
      requirements: [
        {
          category: 'Unpaid work',
          requirement: '100 hours',
          required: 100,
          completed: 40,
          unit: 'hours',
          title: 'Unpaid work',
          rows: [{ label: 'Unpaid work', value: '100 hours' }],
        },
      ],
    },
    progress: {
      lastUpdated: '10 April 2026, 2.29pm',
      overallOrder: {
        title: 'Community order',
        rows: [
          { label: 'Order start date', value: '15 January 2026' },
          { label: 'Order end date', value: '14 January 2027' },
          { label: 'Time left', value: '8 months' },
        ],
      },
      requirements: [
        {
          title: 'Unpaid work',
          action: {
            label: 'View probation conditions',
            href: '/conditions',
          },
          rows: [
            { label: 'Total hours', value: '100 Hours' },
            { label: 'Hours completed', value: '40 Hours' },
            { label: 'Hours left to do', value: '60 Hours' },
          ],
        },
      ],
    },
    appointments: {
      layout: 'default',
      pageTitle: 'Your appointments',
      lastUpdated: '10 April 2026, 2.29pm',
      intro:
        'Your probation appointments are part of the rules of your probation. If you have any problems attending an appointment, you should let your probation officer know as soon as possible.',
      warning:
        'This is not a full list of all your probation appointments. There could be other appointments not listed here.',
      upcomingTitle: 'Upcoming appointments',
      pastTitle: 'Past appointments',
      upcomingAppointments: [
        buildAppointment({
          date: 'Monday 13 April 2026',
          time: '10:00am',
          title: 'Appointment',
          category: 'Appointment',
          location: 'Probation Office\n123 Main Street\nSE1 2AB',
          contact: 'Probation officer',
          contactLabel: 'Who with',
          mandatory: true,
          showOnMap: true,
          mapHref: '#',
          calendarHref: '#',
        }),
        buildAppointment({
          date: 'Wednesday 15 April 2026',
          time: '11:00am',
          title: 'Unpaid work',
          category: 'Unpaid work',
          location: '123 Example Street\nLondon\nSW1A 1AA',
          contact: 'Unpaid work provider',
          contactLabel: 'Key contact',
          mandatory: true,
          showOnMap: true,
          mapHref: '#',
          calendarHref: '#',
        }),
      ],
      pastAppointments: [
        buildAppointment({
          date: 'Wednesday 8 April 2026',
          time: '11:00am',
          title: 'Unpaid work',
          category: 'Unpaid work',
          location: '123 Example Street\nLondon\nSW1A 1AA',
          contact: 'Unpaid work provider',
          contactLabel: 'Key contact',
          mandatory: true,
          status: 'Missed',
          statusTagClassName: 'govuk-tag--red',
        }),
        buildAppointment({
          date: 'Monday 16 March 2026',
          time: '1:00pm',
          title: 'Appointment',
          category: 'Appointment',
          location: 'Probation Office\n123 Main Street\nSE1 2AB',
          contact: 'Probation officer',
          contactLabel: 'Key contact',
          mandatory: true,
          status: 'Attended',
          statusTagClassName: 'govuk-tag--green',
        }),
        buildAppointment({
          date: 'Wednesday 25 February 2026',
          time: '10:00am',
          title: 'First appointment',
          category: 'First appointment',
          location: 'Probation Office\n123 Main Street\nSE1 2AB',
          contact: 'Probation officer',
          contactLabel: 'Key contact',
          mandatory: true,
          status: 'Attended',
          statusTagClassName: 'govuk-tag--green',
        }),
      ],
    },
  }
}

function createScenarioTwoProfile(crn: string): PopStaticProfile {
  return {
    dashboard: {
      welcomeName: 'Jay Doe',
      cards: [
        {
          title: 'Personal details',
          description: 'Your personal contact details and emergency contact details',
          href: '/your-details',
        },
        {
          title: 'Probation officer details',
          description: "Your probation officer's contact details",
          href: '/probation-officer-details',
        },
        {
          title: 'Your progress',
          description: 'Your progress in unpaid work, community orders and other conditions',
          href: '/your-progress',
        },
        {
          title: 'Your probation requirements',
          description: 'The rules you need to follow as part of your probation',
          href: '/conditions',
        },
        {
          title: 'Your appointments',
          description: 'A list of some of your past and future appointments',
          href: '/appointments',
        },
        {
          title: 'Probation service expectations',
          description: 'What probation expects of you',
          href: '/expectations',
        },
        {
          title: 'Talk to our chatbot',
          description: 'You can ask our chatbot questions',
          href: '#',
          action: 'open-chatbot',
        },
      ],
      chatbot: getPopChatbotConfig(crn) || undefined,
    },
    userDetails: {
      userId: crn,
      pageTitle: 'Personal details',
      lastUpdated: '10 April 2026, 2.29pm',
      intro: 'If you need to update any of your details, you should contact your probation officer and let them know.',
      personalDetailsTitle: 'Your personal details',
      contactDetailsTitle: 'Your contact details',
      hideIdentityNumbers: true,
      hideProbationPractitionerDetails: true,
      name: 'Jay Doe',
      preferredName: 'JJ',
      dateOfBirth: '15 March 1999',
      address: '123 Example Street\nLondon\nSW1A 1AA',
      phone: '07700 900123',
      mobile: '07912 345678',
      email: 'jay.doe@email.com',
      emergencyContact: {
        name: 'John Doe',
        relationship: 'Sibling',
        phone: '07700 900456',
      },
      probationPractitioner: {
        name: 'Sarah Smith',
        phone: '020 7946 0958',
        officeAddress: 'National Probation Service\n235 Greenwich High Road\nLondon\nSE10 8NB',
      },
    },
    probationOfficerDetails: {
      pageTitle: 'Probation officer details',
      lastUpdated: '10 April 2026, 2.29pm',
      intro: 'If you need to update any of your details, you should contact your probation officer and let them know.',
      sectionTitle: 'Probation officer details',
      name: 'Sarah Smith',
      phone: '020 7946 0958',
      officeAddress: 'National Probation Service\n235 Greenwich High Road\nLondon\nSE10 8NB',
      email: '',
    },
    orderSummary: {
      pageTitle: 'Your probation requirements',
      intro:
        'These are the conditions of your probation. Not following these rules can lead to you being breached. This means you could end up having more rules added to your probation, going back to court or going back to prison.',
      orderDetailsTitle: 'Order details',
      rulesTitle: 'Rules of your order',
      rulesAction: {
        label: 'View progress',
        href: '/your-progress',
      },
      orderType: 'Community order',
      startDate: '15 January 2026',
      requirementsCompletionDate: '14 January 2027',
      requirements: [
        {
          category: 'Curfew',
          requirement:
            'You must stay at 123 Example Street, London, SW1A 1AA between 10:00 pm and 6:00 am on Mondays to Thursdays, and between 11:00 pm and 8:00 am on Fridays and Saturdays for a period of 3 months from 15 January 2026 to 30 April 2026',
          title: 'Curfew',
          rows: [
            {
              label: 'Curfew',
              value:
                'You must stay at 123 Example Street, London, SW1A 1AA between 10:00 pm and 6:00 am on Mondays to Thursdays, and between 11:00 pm and 8:00 am on Fridays and Saturdays for a period of 3 months from 15 January 2026 to 30 April 2026',
            },
          ],
        },
        {
          category: 'Rehabilitation activity requirement (RAR)',
          requirement: '20 days',
          required: 20,
          unit: 'days',
          title: 'Rehabilitation activity requirement (RAR)',
          rows: [{ label: 'Rehabilitation activity requirement (RAR)', value: '20 days' }],
        },
      ],
    },
    progress: {
      lastUpdated: '10 April 2026, 2.29pm',
      overallOrder: {
        title: 'Community order',
        meter: {
          startLabel: '0 months',
          endLabel: '12 months',
          valuePercent: 33,
          color: 'black',
        },
        rows: [
          { label: 'Order start date', value: '15 January 2026' },
          { label: 'Order end date', value: '14 January 2027' },
          { label: 'Time left', value: '8 months' },
        ],
      },
      requirements: [
        {
          title: 'Curfew',
          meter: {
            startLabel: '0 months',
            endLabel: '4 months',
            valuePercent: 75,
            color: 'blue',
          },
          action: {
            label: 'View probation conditions',
            href: '/conditions',
          },
          rows: [
            { label: 'Curfew start date', value: '15 January 2026' },
            { label: 'Curfew end date', value: '15 May 2026' },
            { label: 'Time left', value: '1 month' },
          ],
        },
        {
          title: 'Rehabilitation activity requirement (RAR)',
          meter: {
            startLabel: '0 days',
            endLabel: '20 days',
            valuePercent: 20,
            color: 'blue',
          },
          rows: [
            { label: 'Total days', value: '20 days' },
            { label: 'Days completed', value: '4 days' },
            { label: 'Days remaining', value: '16 days' },
          ],
        },
      ],
    },
    appointments: {
      layout: 'grouped-by-date',
      pageTitle: 'Your appointments',
      lastUpdated: '10 April 2026, 2.29pm',
      intro:
        'Your probation appointments are part of the rules of your probation. If you have any problems attending an appointment, you should let your probation officer know as soon as possible.',
      warning:
        'This is not a full list of all your probation appointments. There could be other appointments not listed here.',
      upcomingTitle: 'Upcoming appointments',
      pastTitle: 'Past appointments',
      upcomingAppointments: [
        buildAppointment({
          date: 'Wednesday 15 April 2026',
          time: '09:00am',
          title: 'CV and employment session',
          location: '123 Example Street\nLondon\nSW1A 1AA',
          contact: 'Probation settlement worker',
          contactLabel: 'Who with',
          showOnMap: true,
          mapHref: '#',
          calendarHref: '#',
        }),
        buildAppointment({
          date: 'Wednesday 15 April 2026',
          time: '11:30am',
          title: 'Housing support',
          location: '123 Example Street\nLondon\nSW1A 1AA',
          contact: 'Commissioned housing support charity',
          contactLabel: 'Who with',
          showOnMap: true,
          mapHref: '#',
          calendarHref: '#',
        }),
        buildAppointment({
          date: 'Monday 13 April 2026',
          time: '10:00am',
          title: 'Appointment',
          location: 'Probation Office\n123 Main Street\nSE1 2AB',
          contact: 'Probation officer',
          contactLabel: 'Key contact',
          mandatory: true,
          showOnMap: true,
          mapHref: '#',
          calendarHref: '#',
        }),
      ],
      pastAppointments: [
        buildAppointment({
          date: 'Monday 16 March 2026',
          time: '10:00am',
          title: 'Appointment',
          location: 'Probation Office\n123 Main Street\nSE1 2AB',
          contact: 'Probation officer',
          contactLabel: 'Key contact',
          mandatory: true,
          status: 'Attended',
          statusTagClassName: 'govuk-tag--green',
        }),
        buildAppointment({
          date: 'Wednesday 25 February 2026',
          time: '10:00am',
          title: 'First appointment',
          location: 'Probation Office\n123 Main Street\nSE1 2AB',
          contact: 'Probation officer',
          contactLabel: 'Key contact',
          mandatory: true,
          status: 'Missed',
          statusTagClassName: 'govuk-tag--red',
        }),
      ],
    },
  }
}

const staticProfilesByCrn: Record<string, PopStaticProfile> = {
  X975562: createScenarioOneProfile('X975562'),
  X975563: createScenarioTwoProfile('X975563'),
}

export function hasStaticProfile(crn: string): boolean {
  return crn in staticProfilesByCrn
}

export function getStaticProfile(crn: string): PopStaticProfile | null {
  return staticProfilesByCrn[crn] ?? null
}

export function getStaticProfileForChatContext(crn: string): Record<string, unknown> | null {
  const profile = getStaticProfile(crn)
  if (!profile) {
    return null
  }

  // Map POP UI's data shape onto the keys the chatbot's
  // format_probation_personal_context formatter expects (camelCase, top-level).
  // Without this remap, fields like appointments collapse to "(None)" because
  // the formatter looks for `appointments.upcoming` while POP stores the same
  // data under `appointments.upcomingAppointments`.
  const { userDetails, orderSummary, appointments } = profile

  return {
    personalDetails: {
      name: userDetails.name,
      preferredName: userDetails.preferredName,
      dateOfBirth: userDetails.dateOfBirth,
      userId: userDetails.userId,
    },
    contactDetails: {
      address: userDetails.address,
      phone: userDetails.phone,
      mobile: userDetails.mobile,
      email: userDetails.email,
    },
    emergencyContact: userDetails.emergencyContact,
    probationPractitioner: userDetails.probationPractitioner,
    orderDetails: {
      orderType: orderSummary.orderType,
      startDate: orderSummary.startDate,
      requirementsCompletionDate: orderSummary.requirementsCompletionDate,
      requirements: orderSummary.requirements,
    },
    appointments: {
      upcoming: appointments.upcomingAppointments,
      past: appointments.pastAppointments,
    },
  }
}
