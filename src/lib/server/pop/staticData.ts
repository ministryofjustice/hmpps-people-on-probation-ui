import type {
  PopAppointment,
  PopAppointmentsDetails,
  PopOrderSummary,
  PopProbationOfficerDetails,
  PopProgressDetails,
  PopUserDetails,
} from './index'

export type PopStaticProfile = {
  dashboard: {
    welcomeName: string
    cards: {
      title: string
      description: string
      href: string
    }[]
  }
  userDetails: PopUserDetails
  probationOfficerDetails: PopProbationOfficerDetails
  orderSummary: PopOrderSummary
  progress: PopProgressDetails
  appointments: PopAppointmentsDetails
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
          title: 'Your probation conditions',
          description: 'The rules you need to follow as part of your probation',
          href: '/conditions',
        },
        {
          title: 'Past and future appointments',
          description: 'A list of some of your past and future appointments',
          href: '/appointments',
        },
      ],
    },
    userDetails: {
      userId: crn,
      pageTitle: 'Personal details',
      lastUpdated: '10 March 2025, 2.29pm',
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
      lastUpdated: '10 March 2025, 2.29pm',
      intro: 'If you need to update any of your details, you should contact your probation officer and let them know.',
      sectionTitle: 'Probation officer details',
      name: 'Sarah Smith',
      phone: '020 7946 0958',
      officeAddress: 'National Probation Service\n235 Greenwich High Road\nLondon\nSE10 8NB',
      email: '{general email}',
      emailHref: '#',
    },
    orderSummary: {
      pageTitle: 'Your probation conditions',
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
      lastUpdated: '10 March 2025, 2.29pm',
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
      pageTitle: 'Past and future appointments',
      lastUpdated: '10 March 2025, 2.29pm',
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
          title: 'Planned Office Visit (NS)',
          category: 'Planned Office Visit (NS)',
          location: 'Probation Office\n123 Main Street\nSE1 2AB',
          contact: 'Probation officer',
          contactLabel: 'Who with',
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
        }),
        buildAppointment({
          date: 'Monday 16 March 2026',
          time: '1:00pm',
          title: 'Planned Office Visit (NS)',
          category: 'Planned Office Visit (NS)',
          location: 'Probation Office\n123 Main Street\nSE1 2AB',
          contact: 'Probation officer',
          contactLabel: 'Key contact',
        }),
        buildAppointment({
          date: 'Wednesday 25 February 2026',
          time: '10:00am',
          title: 'Initial appointment - in-office (NS)',
          category: 'Initial appointment - in-office (NS)',
          location: 'Probation Office\n123 Main Street\nSE1 2AB',
          contact: 'Probation officer',
          contactLabel: 'Key contact',
        }),
      ],
    },
  }
}

const staticProfilesByCrn: Record<string, PopStaticProfile> = {
  X975562: createScenarioOneProfile('X975562'),
  DEMO001: createScenarioOneProfile('DEMO001'),
}

export function hasStaticProfile(crn: string): boolean {
  return crn in staticProfilesByCrn
}

export function getStaticProfile(crn: string): PopStaticProfile | null {
  return staticProfilesByCrn[crn] ?? null
}
