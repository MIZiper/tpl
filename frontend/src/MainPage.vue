<template>
  <v-app-bar>
    <v-app-bar-title>
      <v-icon>mdi-clipboard-text</v-icon>
      Test Planner & Logger
    </v-app-bar-title>
  </v-app-bar>

  <v-navigation-drawer expand-on-hover rail>
    <v-list>
      <v-list-item title="Home" prependIcon="mdi-home" />
      <v-list-item title="Bricks" prependIcon="mdi-wall" />
      <v-list-item title="Planner" prependIcon="mdi-calendar" />
      <v-list-item title="Logger" prependIcon="mdi-clipboard-clock" />
    </v-list>
  </v-navigation-drawer>

  <v-main>
    <TestPlanner />
  </v-main>

  <v-navigation-drawer location="right">
    <v-list>
      <v-list-subheader>Tools</v-list-subheader>
      <v-divider></v-divider>
      <v-list-item>Tool A</v-list-item>
      <v-list-item>Tool B</v-list-item>
      <v-list-item>Tool C</v-list-item>
    </v-list>
  </v-navigation-drawer>
</template>