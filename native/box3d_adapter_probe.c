#include "box3d_adapter.h"

int main(void) {
    lag_world *world = lag_world_create(0.0, -9.81);
    if (world == 0) {
        return 1;
    }

    if (lag_world_body_count(world) != 0) {
        lag_world_destroy(world);
        return 2;
    }

    lag_world_destroy(world);
    return 0;
}
