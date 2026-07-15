#include "box3d_adapter.h"

/*
 * This translation unit is the stable C ABI boundary.  The Box3D-backed
 * implementation is intentionally kept behind it so neither Rust nor
 * Python has to know Box3D's types.  Build integration will replace the
 * internal world with b3World in the native milestone.
 */
struct lag_world {
    double gravity_x;
    double gravity_y;
};

lag_world *lag_world_create(double gravity_x, double gravity_y) {
    (void)gravity_x;
    (void)gravity_y;
    return 0;
}

void lag_world_destroy(lag_world *world) {
    (void)world;
}

int lag_world_step(lag_world *world, double dt, int solver_iterations) {
    (void)world;
    (void)dt;
    (void)solver_iterations;
    return -1;
}

int lag_world_body_count(const lag_world *world) {
    (void)world;
    return 0;
}

int lag_world_read_bodies(const lag_world *world, lag_body_state *out, size_t capacity) {
    (void)world;
    (void)out;
    (void)capacity;
    return 0;
}
